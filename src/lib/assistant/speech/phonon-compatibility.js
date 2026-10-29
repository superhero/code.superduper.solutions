// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export const PHONON_GPU_BUFFER_BYTES=1440898696;
export function phononCompatibility(facts) {
  const rows=[
    {title:'Secure page',passed:!!facts.secure,detail:'HTTPS or localhost is required.'},
    {title:'Cross-origin isolation and shared memory',passed:!!facts.isolated&&!!facts.threads,detail:'COOP/COEP and shared WebAssembly memory are required.'},
    {title:'WebAssembly SIMD',passed:!!facts.wasm&&!!facts.simd,detail:'Required by the Phonon runtime and TEN-VAD.'},
    {title:'WebAssembly JSPI',passed:!!facts.jspi,detail:'GPU load and recognition require promise integration.'},
    {title:'WebGPU compute',passed:!!facts.gpu?.compute,detail:'Phonon must select an actual GPU backend.'},
    {title:'FP16 GPU shaders',passed:!!facts.gpu?.f16_compute,detail:'The GPU runtime requires shader-f16.'},
    {title:'GPU buffer limits',passed:(facts.gpu?.limits?.max_buffer_bytes??0)>=PHONON_GPU_BUFFER_BYTES&&(facts.gpu?.limits?.max_storage_binding_bytes??0)>=134217728,detail:'At least 1.44 GB per buffer and 128 MiB per storage binding. This does not measure free VRAM.'},
  ];
  return {ready:rows.every(row=>row.passed),rows};
}
