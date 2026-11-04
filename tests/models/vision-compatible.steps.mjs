// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from 'quickpickle';
import {expect} from 'vitest';
import profiles from '../../src/lib/assistant/browser/expanded-catalog.json';
import {visionPin,requireVisionDevice,requireVisionDispatch} from '../../src/lib/assistant/browser/reference/expanded/vision-pins.js';
import {compatibilityFor} from '../../src/lib/assistant/browser/compatibility.js';
import {createVisionTool} from '../../src/lib/assistant/browser/reference/expanded/vision-tool.js';
import {loadVisionRuntime,bindVisionSessionOptions,summarizeVisionSessionOptions,instrumentVisionDevice,releaseVisionRuntime} from '../../src/lib/assistant/browser/reference/expanded/vision-worker.js';
const profile=profiles.find(p=>p.id==='ox-browser-lfm25-vision-compatible');
Then('compatible vision installs the five original Q4 and FP32 model files',()=>{
 const files=profile.artifacts.filter(f=>f.kind==='weights');expect(files).toHaveLength(5);
 expect(files.reduce((n,f)=>n+f.bytes,0)).toBe(2024081183);
 expect(files.find(f=>f.id==='onnx/embed_tokens.onnx').sha256).toBe('489b999a0862f14342d20e38f3ed33df91a4fda7476b44dd4d65531a57fc1b9a');
 expect(files.some(f=>f.id==='onnx/embed_tokens.onnx_data')).toBe(false);
 expect(files.every(f=>f.url.includes('/resolve/d0e00ca26cc42892d9f3c4380faa631927218209/'))).toBe(true);
 const old=profiles.find(p=>p.id==='jo-browser-mobile-lfm25-vl16b-letterbox');
 expect(visionPin(old).dtype.vision_encoder).toBe('fp16');expect(visionPin(profile).dtype.vision_encoder).toBe('q4');
 expect(profiles.filter(p=>p.id.endsWith('-native-vision'))).toHaveLength(2);
 expect(()=>visionPin({...profile,settings:{...profile.settings,precision_variant:'unqualified'}})).toThrow(/Unqualified/);
});
Then('compatible image preflight requires nine storage buffers without shader-f16',async()=>{
 const facts={secure:true,wasm:true,simd:true,gpu:{compute:true,f16_compute:false,limits:{max_storage_buffers_per_shader_stage:9}}};
 expect(compatibilityFor(facts,profile).ready).toBe(true);
 const unsupported={...facts,gpu:{...facts.gpu,limits:{max_storage_buffers_per_shader_stage:8}}};
 expect(compatibilityFor(unsupported,profile).ready).toBe(false);
 let suspended=false,loaded=false;
 const tool=createVisionTool({profile,getImage:()=>({data:'AAAA',mimeType:'image/png',width:1,height:1}),
  checkCapabilities:async()=>{if(!compatibilityFor(unsupported,profile).ready)throw Error('Needs nine storage buffers');},
  suspendText:async()=>{suspended=true;},resumeText:async()=>{},loadVision:async()=>{loaded=true;}});
 await expect(tool.tool.execute('image',{image_id:'image-1',question:'Describe it.'})).rejects.toThrow(/nine/);
 expect([suspended,loaded,tool.state.text_ready]).toEqual([false,false,true]);await tool.dispose();
});
Then('compatible vision sessions share an explicit device and embedded token weights',async()=>{
 const pin=visionPin(profile),device={label:'owned'},seen=[];
 const library={env:{},AutoConfig:{from_pretrained:async()=>({})},AutoTokenizer:{from_pretrained:async()=>({})},
  Lfm2VlImageProcessor:class{},Lfm2VlProcessor:class{constructor(_config,parts){this.tokenizer=parts.tokenizer;}},
  PreTrainedModel:{from_pretrained:async(_repo,options)=>{seen.push(options);const output={embed_tokens:'inputs_embeds',embed_images:'image_features',decoder:'logits'}[options.model_file_name];return{sessions:{model:{outputNames:[output]}}};}},
  Lfm2VlForConditionalGeneration:class{constructor(_config,sessions){this.sessions=sessions;}}};
 const options=bindVisionSessionOptions(pin,device);
 await loadVisionRuntime(library,pin,{sessionOptions:options,fetchJSON:async()=>({image_processor:{}}),fetchText:async()=>''});
 expect(seen).toHaveLength(3);
 for(const session of seen){expect(session.session_options.executionProviders[0].device).toBe(device);expect(session.session_options.extra.session.disable_cpu_ep_fallback).toBe('0');}
 expect(seen.map(s=>[s.model_file_name,s.dtype,s.use_external_data_format])).toEqual([['embed_tokens','fp32',false],['embed_images','q4',true],['decoder','q4',true]]);
 expect(summarizeVisionSessionOptions(options).executionProviders[0].device).toBe('owned-gpu-device');
});
Then('compatible vision requires positive drained GPU dispatches and serializable metadata',async()=>{
 const device={createComputePipeline:()=>({}),createCommandEncoder:()=>({beginComputePass:()=>({dispatchWorkgroups(){},dispatchWorkgroupsIndirect(){},end(){}}),finish:()=>({})}),queue:{submit(){},async onSubmittedWorkDone(){}}};
 const audit=instrumentVisionDevice(device),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.dispatchWorkgroups(1);pass.end();device.queue.submit([encoder.finish()]);
 expect(()=>requireVisionDispatch({gpu_execution:{...audit.snapshot(),delta:{queue_drained_dispatches:0}}})).toThrow(/completed/);
 const result=await audit.drain();requireVisionDispatch({gpu_execution:{...result,delta:{queue_drained_dispatches:result.queue_drained_dispatches}}});
 requireVisionDevice({execution_provider_device:'explicit-owned-gpu-device',device_shader_f16:false,requested_device_features:[],device_limits:{maxStorageBuffersPerShaderStage:9}});
 expect(()=>requireVisionDevice({execution_provider_device:'ort-managed'})).toThrow(/bind/);
 expect(result.queue_drained_dispatches).toBe(1);
});
Then('compatible vision teardown releases sessions before draining and destroying its device',async()=>{
 for(const fail of [false,true]){
  const calls=[],runtime={model:{dispose:async()=>{calls.push('sessions');if(fail)throw Error('release failed');}}},device={queue:{onSubmittedWorkDone:async()=>{calls.push('drain');}},destroy:()=>calls.push('destroy')};
  if(fail)await expect(releaseVisionRuntime(runtime,device)).rejects.toThrow('release failed');else await releaseVisionRuntime(runtime,device);
  expect(calls).toEqual(['sessions','drain','destroy']);
 }
});
