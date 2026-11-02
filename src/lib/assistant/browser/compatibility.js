// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {compatibilityFor as nativeCompatibility} from './reference/compatibility.js';
export {probeBrowser} from './reference/compatibility.js';
export function compatibilityFor(facts, profile, mode = 'auto') {
  if (!facts) return {ready: false, rows: [], summary: 'Run the browser capability checks.'};
  if (profile.category === 'vision' && profile.engine === 'wllama') return nativeCompatibility(facts,profile,'gpu');
  if (!profile.settings.gpu_graph_only && profile.category !== 'decision' && profile.category !== 'vision' && profile.engine !== 'litert-lm' && profile.engine !== 'lfm3-onnx') return nativeCompatibility(facts,profile,mode);
  const rows = [], native = !!profile.settings.gpu_graph_only || profile.category === 'decision' && !['strands-onnx','lfm3-onnx'].includes(profile.engine);
  const fp32 = !!profile.settings.gpu_graph_only || profile.browser_probe?.compute_precision === 'float32';
  const add = (id,title,pass,required,detail) => rows.push({id,title,state:pass ? 'pass' : required ? 'fail' : 'info',required,detail});
  add('secure','Secure page',facts.secure,true,'A secure browser context is required.');
  add('wasm','WebAssembly SIMD',facts.wasm && facts.simd,true,'The pinned runtime requires WebAssembly SIMD.');
  if (native) {
    add('threads','Shared memory and isolation',facts.threads && facts.isolated,true,'Native inference requires shared WebAssembly memory and COOP/COEP.');
    add('jspi','Streaming WebAssembly (JSPI)',facts.jspi,true,'The selected native build requires JSPI.');
    add('memory64','64-bit WebAssembly memory',facts.memory64,true,'The selected native build requires Memory64.');
  }
  add('gpu','GPU computation',facts.gpu.compute,true,'This model requires usable WebGPU. Enable WebGPU in a supported browser; CPU fallback is disabled.');
  add('f16','GPU FP16 (shader-f16)',facts.gpu.f16_compute,!fp32 && profile.engine !== 'litert-lm',fp32 ? 'The pinned FP32 GPU path does not require shader-f16.' : 'This FP16 GPU profile requires shader-f16. Use an FP32 GPU profile when this feature is unavailable.');
  if (profile.engine === 'litert-lm') add('mode','GPU_ARTISAN', ['auto','gpu'].includes(mode),true,'Gemma supports the verified greedy GPU_ARTISAN path.');
  rows.push({id:'memory',title:'Memory capacity',state:'info',required:false,detail:'File size is not RAM/VRAM usage. Free memory and phone compatibility are unqualified.'});
  const ready = !rows.some(row => row.required && row.state === 'fail');
  return {ready,rows,summary:ready ? 'GPU path available; memory fit is checked while loading.' : 'Required browser capabilities are missing.'};
}
