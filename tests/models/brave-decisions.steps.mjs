// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from 'quickpickle';
import {expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import profiles from '../../src/lib/assistant/browser/expanded-catalog.json';
import {compatibilityFor} from '../../src/lib/assistant/browser/compatibility.js';
import {createDecisionEngine} from '../../src/lib/assistant/browser/reference/expanded/decisions.js';
import {nativeGpuPlacement} from '../../src/lib/assistant/browser/reference/expanded/decision-placement.js';
const facts={secure:true,isolated:true,wasm:true,simd:true,memory64:true,threads:true,jspi:true,gpu:{compute:false,f16_compute:false}};
Then('decision choices contain no CPU profiles and fail without usable WebGPU',()=>{
 const decision=profiles.filter(p=>p.category==='decision');expect(decision).toHaveLength(10);
 for(const p of decision){expect(p.browser_probe?.device).not.toBe('wasm');expect(p.runtime_id).not.toMatch(/cpu/);expect(compatibilityFor(facts,p).ready,p.id).toBe(false);}
 const native=decision.filter(p=>p.runtime_id==='decision-fp32');expect(native).toHaveLength(7);
 for(const p of native){
  const available={...facts,gpu:{compute:true,f16_compute:false}};expect(compatibilityFor(available,p).ready).toBe(true);
  for(const key of ['isolated','threads','jspi','memory64'])expect(compatibilityFor({...available,[key]:false},p).ready).toBe(false);
  expect(p.browser_probe.load_options).toMatchObject({n_gpu_layers:99,cache_type_k:'f32',cache_type_v:'f32',flash_attn:false,n_ctx:1024,n_batch:1024,n_ubatch:1024});
 }
});
Then('Strands compatibility requires FP16 only for the original GPU graph',()=>{
 const original=profiles.find(p=>p.runtime_id==='strands-gpu');expect(compatibilityFor({...facts,gpu:{compute:true,f16_compute:false}},original).ready).toBe(false);
 const fp32=profiles.find(p=>p.runtime_id==='strands-fp32');expect(compatibilityFor({...facts,gpu:{compute:true,f16_compute:false}},fp32).ready).toBe(true);
});
const loadProof=gpu=>{for(const line of ['FP32_COMPAT device shader_f16=0','load_tensors: WebGPU model buffer size = 128.00 MiB','load_tensors: offloaded 33/33 layers to GPU'])gpu.observe(line);};
Then('native decision placement rejects CPU fallback and incomplete offload',()=>{
 const gpu=nativeGpuPlacement('q8_0');gpu.observe('FP32_COMPAT device shader_f16=0');gpu.observe('load_tensors: CPU model buffer size = 128.00 MiB');gpu.observe('load_tensors: offloaded 33/33 layers to GPU');expect(()=>gpu.verify(32)).toThrow(/CPU fallback is disabled/);
 gpu.observe('load_tensors: WebGPU model buffer size = 128.00 MiB');gpu.observe('load_tensors: offloaded 12/33 layers to GPU');expect(()=>gpu.verify(32)).toThrow(/placement/);
 gpu.observe('load_tensors: offloaded 33/33 layers to GPU');expect(gpu.verify(32).backend).toBe('webgpu');
 gpu.observe('FP32_COMPAT device shader_f16=1');expect(()=>gpu.verify(32)).toThrow(/placement/);
});
Then('native placement accepts case-insensitive Q4_K pipelines and rejects the wrong kernel',()=>{
 const gpu=nativeGpuPlacement('q4_k|q6_k');loadProof(gpu);expect(()=>gpu.verify(32,true)).toThrow(/matrix pipeline/);
 gpu.observe('FP32_COMPAT pipeline mul_mat_q8_0');expect(()=>gpu.verify(32,true)).toThrow(/matrix pipeline/);
 gpu.observe('FP32_COMPAT pipeline mul_mat_vec_q4_K');expect(gpu.verify(32,true).compute_verified).toBe(true);
});
Then('native decision loading refuses CPU execution even when capabilities are available',async()=>{
 const base=profiles.find(p=>p.family==='d3'),profile={...base,browser_probe:{...base.browser_probe,load_options:{...base.browser_probe.load_options,n_gpu_layers:0}}};let created=false;
 await expect(createDecisionEngine(profile,{Wllama:class{constructor(){created=true;}},signal:new AbortController().signal})).rejects.toThrow(/CPU execution is not offered/);expect(created).toBe(false);
});
Then('decision GPU artifacts and recipes match their reference receipts',async()=>{
 const recipe='build/browser-models/native/shared-fp32/',dir='src/public/browser-models/wllama-decision-fp32/';
 const pins=JSON.parse(await readFile(recipe+'pins.json')),receipt=JSON.parse(await readFile(dir+'build-receipt.json'));expect(receipt.context_variant.variant).toBe('shared-fp32');
 for(const name of ['index.js','wllama.wasm','LICENCE'])expect(createHash('sha256').update(await readFile(dir+name)).digest('hex')).toBe(pins.files[name]);
 for(const [name,hash]of Object.entries(pins.inputs_sha256)){expect(receipt.inputs_sha256[name]).toBe(hash);expect(createHash('sha256').update(await readFile(recipe+name)).digest('hex')).toBe(hash);}
 const elephant=profiles.find(p=>p.family==='elephant');expect(elephant.model).toBe('mradermacher/elephant-1-GGUF');expect(elephant.weight_sha256).toBe('10c77ea2339ffe7e012db453e77fa30762ba27377b117985db5141743ad17939');
});
