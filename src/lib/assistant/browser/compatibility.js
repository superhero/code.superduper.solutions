// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {compatibilityFor as nativeCompatibility} from './reference/compatibility.js';
export {probeBrowser} from './reference/compatibility.js';
export function compatibilityFor(facts, profile, mode = 'auto') {
  if (!facts) return {ready: false, rows: [], summary: 'Run the browser capability checks.'};
  if (profile.category !== 'decision' && profile.category !== 'vision' && profile.engine !== 'litert-lm') return nativeCompatibility(facts,profile,mode);
  const rows = [], native = profile.category === 'decision' && profile.engine !== 'strands-onnx';
  const cpu = profile.runtime_id === 'strands-cpu', needsGPU = !cpu;
  const add = (id,title,pass,required,detail) => rows.push({id,title,state:pass ? 'pass' : required ? 'fail' : 'info',required,detail});
  add('secure','Secure page',facts.secure,true,'A secure browser context is required.');
  add('wasm','WebAssembly SIMD',facts.wasm && facts.simd,true,'The pinned runtime requires WebAssembly SIMD.');
  if (native) {
    add('threads','Shared memory and isolation',facts.threads && facts.isolated,true,'Native decision inference requires shared WebAssembly memory and COOP/COEP.');
    add('jspi','Streaming WebAssembly (JSPI)',facts.jspi,true,'The selected native decision build requires JSPI.');
    add('memory64','64-bit WebAssembly memory',facts.memory64,true,'The selected native decision build requires Memory64.');
  }
  add('gpu','GPU computation',facts.gpu.compute,needsGPU, cpu ? 'This profile uses its original Wasm CPU backbone.' : 'This verified profile requires GPU execution.');
  add('f16','GPU FP16 (shader-f16)',facts.gpu.f16_compute,needsGPU && profile.engine !== 'litert-lm','FP16 compute must work for this profile.');
  if (profile.engine === 'litert-lm') add('mode','GPU_ARTISAN', ['auto','gpu'].includes(mode),true,'Gemma supports the verified greedy GPU_ARTISAN path.');
  rows.push({id:'memory',title:'Memory capacity',state:'info',required:false,detail:'File size is not RAM/VRAM usage. Free memory and phone compatibility are unqualified.'});
  const ready = !rows.some(row => row.required && row.state === 'fail');
  return {ready,rows,summary:ready ? `${cpu ? 'CPU' : 'GPU'} path available; memory fit is checked while loading.` : 'Required browser capabilities are missing.'};
}
