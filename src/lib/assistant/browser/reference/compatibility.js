// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01/inference/evaluations/pi-browser/runtime/src/compatibility.js.
import {CPU_HEAP_BYTES, fullCPUFitsBuild} from './execution.js';
import {isWebML, isWllama} from './settings.js';
const header = [0, 97, 115, 109, 1, 0, 0, 0];
const simdModule = [...header, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11];
const memory64Module = [...header, 5, 3, 1, 4, 0];
const timed = async (promise, ms = 8000) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Capability probe timed out')), ms); })]); }
  finally { clearTimeout(timer); }
};

function browserIdentity(nav) {
  const ua = nav.userAgent || '', safari = ua.match(/Version\/([\d.]+).*Safari/);
  const match = ua.match(/(Edg|Firefox|Chrome)\/([\d.]+)/) || (safari ? ['Safari', 'Safari', safari[1]] : null);
  const name = nav.brave ? 'Brave / Chromium' : match?.[1] === 'Edg' ? 'Edge' : match?.[1] || 'Unknown browser';
  return {name, version: match?.[2] || 'not exposed', platform: nav.userAgentData?.platform || nav.platform || 'not exposed', user_agent: ua};
}

async function computeProbe(adapter, f16) {
  const device = await adapter.requestDevice({requiredFeatures: f16 ? ['shader-f16'] : []});
  let input, output, read;
  try {
    device.pushErrorScope('validation');
    const module = device.createShaderModule({code: `${f16 ? 'enable f16;' : ''}
      @group(0) @binding(0) var<storage, read_write> result: array<f32>;
      @group(0) @binding(1) var<storage, read> values: array<f32>;
      @compute @workgroup_size(1) fn main() { result[0] = ${f16 ? 'f32(f16(values[0]) + f16(values[1]))' : 'values[0] + values[1]'}; }`});
    const pipeline = await device.createComputePipelineAsync({layout: 'auto', compute: {module, entryPoint: 'main'}});
    output = device.createBuffer({size: 4, usage: 128 | 4});
    input = device.createBuffer({size: 8, usage: 128 | 8}); device.queue.writeBuffer(input, 0, new Float32Array([1.5, 2]));
    read = device.createBuffer({size: 4, usage: 8 | 1});
    const group = device.createBindGroup({layout: pipeline.getBindGroupLayout(0), entries: [{binding: 0, resource: {buffer: output}}, {binding: 1, resource: {buffer: input}}]});
    const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(1); pass.end();
    encoder.copyBufferToBuffer(output, 0, read, 0, 4); device.queue.submit([encoder.finish()]);
    await read.mapAsync(1);
    const value = new Float32Array(read.getMappedRange())[0]; read.unmap();
    const validation = await device.popErrorScope();
    if (validation || value !== 3.5) throw Error(validation?.message || 'GPU computation returned an incorrect value');
    return true;
  } finally { input?.destroy(); output?.destroy(); read?.destroy(); device.destroy(); }
}

export async function probeBrowser(env = globalThis) {
  const nav = env.navigator || {}, wasm = env.WebAssembly;
  const result = {checked_at: new Date().toISOString(), browser: browserIdentity(nav), secure: !!env.isSecureContext,
    isolated: !!env.crossOriginIsolated, wasm: false, simd: false, memory64: false, threads: false,
    jspi: typeof wasm?.Suspending === 'function' && typeof wasm?.promising === 'function',
    hardware_threads: nav.hardwareConcurrency ?? null, reported_ram_gb: nav.deviceMemory ?? null,
    driver_version: null, free_ram_bytes: null, free_vram_bytes: null,
    gpu: {api: !!nav.gpu, adapter: false, compute: false, f16: false, f16_compute: false}};
  try {
    result.wasm = !!wasm?.validate(new Uint8Array(header));
    result.simd = !!wasm?.validate(new Uint8Array(simdModule));
    result.memory64 = !!wasm?.validate(new Uint8Array(memory64Module));
    result.threads = !!env.SharedArrayBuffer && new wasm.Memory({initial: 1, maximum: 1, shared: true}).buffer instanceof env.SharedArrayBuffer;
  } catch { /* Each actual feature result remains false when unavailable. */ }
  if (nav.gpu) {
    try {
      const adapter = await timed(nav.gpu.requestAdapter({powerPreference: 'high-performance'}));
      if (adapter) {
        result.gpu.adapter = true;
        const info = adapter.info || {};
        result.gpu.info = Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(k => [k, info[k] || '']));
        result.gpu.limits = {max_buffer_bytes: adapter.limits.maxBufferSize, max_storage_binding_bytes: adapter.limits.maxStorageBufferBindingSize};
        result.gpu.f16 = adapter.features.has('shader-f16');
        try { result.gpu.compute = await timed(computeProbe(adapter, false)); } catch (e) { result.gpu.error = e.message; }
        if (result.gpu.f16) {
          try {
            // Dawn can consume an adapter after its first requestDevice call.
            // Probe FP16 with a fresh adapter rather than reusing the FP32 one.
            const fresh = await timed(nav.gpu.requestAdapter({powerPreference: 'high-performance'}));
            if (!fresh) throw Error('No adapter available for the FP16 check');
            result.gpu.f16_compute = await timed(computeProbe(fresh, true));
          } catch (e) { result.gpu.f16_error = e.message; }
        }
      }
    } catch (e) { result.gpu.error = e.message; }
  }
  return result;
}

export function compatibilityFor(facts, profile, mode = 'auto') {
  if (!facts || !profile) return {ready: false, rows: [], summary: 'Checking browser capabilities…'};
  const wllama = isWllama(profile.engine), webml = isWebML(profile.engine), cpuFits = !wllama || fullCPUFitsBuild(profile);
  const needsGPU = webml || ['gpu', 'hybrid'].includes(mode) || (mode === 'auto' && !cpuFits), rows = [];
  const add = (id, title, pass, required, detail) => rows.push({id, title, state: pass ? 'pass' : required ? 'fail' : 'warn', required, detail});
  if (!webml && !wllama) add('engine-runtime', 'Inference engine', false, true, 'Unknown engine: ' + profile.engine);
  if (profile.availability?.state === 'blocked') add('model-runtime', 'Model runtime support', false, true, profile.availability.reason);
  if (!['auto', 'gpu', 'hybrid', 'cpu'].includes(mode)) add('execution-runtime', 'Execution mode', false, true, 'Unknown execution mode: ' + mode);
  else if (webml && ['cpu', 'hybrid'].includes(mode)) add('execution-runtime', 'Execution mode', false, true, 'WebML supports GPU execution only. CPU computation/offload requires a different compatible runtime.');
  add('secure', 'Secure page', facts.secure, true, facts.secure ? 'HTTPS / secure context verified.' : 'Open this hosted page over HTTPS.');
  add('wasm', 'WebAssembly SIMD', facts.wasm && facts.simd, wllama, facts.simd ? 'WebAssembly SIMD module validates.' : wllama ? 'This browser cannot validate the required WebAssembly SIMD instructions. Update it or use a current Chromium browser.' : 'SIMD was not verified; it is optional for this WebML adapter.');
  add('threads', 'Shared memory and isolation', facts.isolated && facts.threads, wllama, facts.isolated && facts.threads ? 'Cross-origin isolation and shared WebAssembly memory verified.' : wllama ? 'The host must serve COOP/COEP headers; shared memory must also be enabled in this browser.' : 'Shared WebAssembly memory was not verified; it is optional for this WebML adapter.');
  if (wllama) {
    add('jspi', 'Streaming WebAssembly (JSPI)', facts.jspi, true, facts.jspi ? 'WebAssembly.Suspending and promising are available.' : `${facts.browser.name} ${facts.browser.version} does not expose JSPI. This streaming runtime needs it; use current Chromium (137+ introduced JSPI).`);
    add('memory64', '64-bit WebAssembly memory', facts.memory64, true, facts.memory64 ? 'Memory64 module validates; this does not verify available RAM.' : 'This Wasm64 runtime needs Memory64. Update your browser; Chromium introduced it in133.');
    rows.push({id: 'runtime-heap', title: 'CPU runtime heap ·4GiB', state: mode === 'cpu' && !cpuFits ? 'fail' : 'info', required: mode === 'cpu' && !cpuFits,
      detail: `This packaged runtime caps its CPU heap at ${CPU_HEAP_BYTES / 2**30}GiB. ${cpuFits ? 'CPU-only model fit still needs validation.' : 'The model CPU weights exceed that limit. Partial CPU offload is allowed; CPU-only requires a larger-heap runtime build, even with more system RAM.'}`});
  }
  const gpuName = Object.values(facts.gpu.info || {}).filter(Boolean).join(' · ') || 'Adapter details not exposed';
  add('gpu', webml ? 'WebML GPU acceleration' : 'GPU acceleration', facts.gpu.compute, needsGPU, facts.gpu.compute ? `A real FP32 compute/readback passed. ${gpuName}.` : `${facts.gpu.error || (facts.gpu.api ? 'No working WebGPU adapter.' : 'WebGPU API is missing.')} Check this browser’s version, hardware acceleration and GPU policy. ${wllama && !needsGPU ? 'CPU mode remains available when the checks above pass.' : 'This selected runtime/mode needs GPU compute.'}`);
  if (wllama) add('f16', 'GPU FP16 (shader-f16)', facts.gpu.f16_compute, needsGPU,
    facts.gpu.f16_compute ? 'A real FP16 compute/readback passed; Wllama GPU work is available.' : `${facts.gpu.f16_error || (facts.gpu.f16 ? 'The FP16 feature is advertised but computation failed.' : 'The adapter does not expose shader-f16.')} ${cpuFits ? 'CPU mode is an alternative.' : 'These weights still need GPU work because of the4GiB CPU heap cap.'} On Linux/NVIDIA, browser/driver policy may be responsible; current Dawn permits FP16 without the override on driver615.71+. The browser cannot verify your installed driver version.`);
  rows.push({id: 'memory', title: 'Memory capacity', state: 'info', required: false,
    detail: `${((profile.weight_bytes + profile.projector.bytes) / 1e9).toFixed(2)} GB of language + vision files; this is not a measured RAM/VRAM requirement. Free RAM and VRAM are not exposed. ${facts.reported_ram_gb ? `Browser-reported system RAM ~${facts.reported_ram_gb}GB is rounded/capped. ` : ''}${wllama ? 'GPU allocation failure: reduce the GPU layer budget. CPU allocation/heap failure: increase GPU work or choose a smaller model.' : 'WebML requires GPU memory; try a smaller model if allocation fails.'}`});
  rows.push({id: 'driver', title: 'Installed driver', state: 'info', required: false, detail: 'Version not exposed by browser APIs. GPU checks above verify capabilities, not the installed driver number.'});
  const ready = !rows.some(row => row.required && row.state === 'fail');
  const gpuReady = facts.gpu.compute && (!wllama || facts.gpu.f16_compute);
  return {ready, rows, summary: !ready ? 'Required checks are missing. See the explanations below.' : wllama && (mode === 'cpu' || !gpuReady) ? 'CPU path available · sufficient host RAM still required.' : `${webml ? 'WebML ' : ''}GPU path available · model memory fit is verified during loading.`};
}
