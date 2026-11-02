// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from 'quickpickle';
import {expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import originals from '../../src/lib/assistant/browser/catalog.json';
import expanded from '../../src/lib/assistant/browser/expanded-catalog.json';
import {compatibilityFor} from '../../src/lib/assistant/browser/compatibility.js';
import {executionPlans} from '../../src/lib/assistant/browser/reference/execution.js';
import {BrowserGGUF} from '../../src/lib/assistant/browser/reference/wllama.js';
import {requireGpuPlacement} from '../../src/lib/assistant/browser/reference/chat-placement.js';
import {createVisionTool} from '../../src/lib/assistant/browser/reference/expanded/vision-tool.js';
const profiles=[...originals,...expanded],strict=profiles.filter(p=>p.settings.gpu_graph_only);
const facts={secure:true,wasm:true,simd:true,threads:true,isolated:true,jspi:true,memory64:true,gpu:{compute:true,f16_compute:false}};
Then('strict chat profiles require usable GPU without requiring shader-f16',()=>{
 expect(strict).toHaveLength(4);
 for(const profile of strict){
  expect(compatibilityFor(facts,profile).ready).toBe(true);
  expect(compatibilityFor({...facts,gpu:{compute:false}},profile).ready).toBe(false);
  expect(executionPlans(profile,facts,{mode:'auto'})).toMatchObject([{mode:'gpu',gpu_layers:99,cpu_fallback:false}]);
  expect(()=>executionPlans(profile,facts,{mode:'cpu'})).toThrow(/GPU/);
  expect(profile.projector).toBeNull();
  expect(profile.settings).toMatchObject({context_tokens:4096,max_new_tokens:256,cache_type_k:'f32',cache_type_v:'f32',flash_attention:false});
 }
 const vision=expanded.filter(p=>p.id.endsWith('-native-vision'));
 expect(vision).toHaveLength(2);
 for(const p of vision) expect(compatibilityFor({...facts,browser:{name:'Brave',version:'154'},gpu:{...facts.gpu,info:{}}},p).ready).toBe(false);
});
Then('strict chat native artifacts and recipes match their pinned receipts',async()=>{
 const hash=value=>createHash('sha256').update(value).digest('hex');
 for(const group of ['chat-gpu','chat-lfm3-gpu']){
  const base='build/browser-models/native/'+group+'/',native='src/public/browser-models/wllama-'+group+'/';
  const pins=JSON.parse(await readFile(base+'pins.json')),receipt=JSON.parse(await readFile(native+'build-receipt.json'));
  for(const [name,sha] of Object.entries(pins.inputs_sha256))expect(hash(await readFile(base+name))).toBe(sha);
  for(const name of ['index.js','wllama.wasm','LICENCE']){expect(hash(await readFile(native+name))).toBe(pins.files[name]);expect(receipt.files[name]).toBe(pins.files[name]);}
 }
 expect(hash(await readFile('src/public/browser-models/wllama/wllama.wasm'))).toBe('68d7d381d505da43b890912552870ec6db54ce18862ce695c6f80cff142c395f');
});
Then('chat placement retains aggregate audits beyond ordinary log rollover',async()=>{
 class Runtime{constructor(_paths,{logger}){this.logger=logger;}async loadModel(){for(const line of ['FP32_COMPAT device shader_f16=0','offloaded 34/34 layers to GPU','GPU_ONLY_MODEL input=GPU no_cpu_weight_fallback=1','FP32_COMPAT pipeline mul_mat_q4_k'])this.logger.log(line);for(let i=0;i<1000;i++)this.logger.log('ordinary '+i);}getLoadedContextInfo(){return{n_layer:34,n_ctx:4096,n_vocab:100};}async exit(){}}
 const model=new BrowserGGUF(strict[0],()=>{},{Wllama:Runtime,wasmUrl:'blob:test',files:[],readArtifact:()=>{}});
 await model.load();expect(model.logs).toHaveLength(200);
 model.raw.logger.log('GPU_ONLY_AUDIT cpu_compute_ops=0 gpu_compute_ops=120');
 expect(requireGpuPlacement(model.placementLogs).gpu_compute_ops).toBe(120);
 model.raw.logger.log('GPU_ONLY_AUDIT cpu_compute_ops=1 gpu_compute_ops=50');
 for(let i=0;i<1000;i++)model.raw.logger.log('later '+i);
 expect(()=>requireGpuPlacement(model.placementLogs)).toThrow(/CPU model/);await model.dispose();
});
Then('a failed vision capability check fetches no model and preserves text',async()=>{
 let suspended=0,loaded=0,resumed=0;
 const control=createVisionTool({profile:expanded.find(p=>p.id.endsWith('-native-vision')),getImage:()=>({data:'AAAA',mimeType:'image/png',width:1,height:1}),
  checkCapabilities:async()=>{throw Error('GPU FP16 unavailable');},suspendText:async()=>{suspended++;},resumeText:async()=>{resumed++;},loadVision:async()=>{loaded++;},onState:()=>{}});
 await expect(control.tool.execute('image-call',{image_id:'image-1',question:'What is here?'})).rejects.toThrow(/FP16/);
 expect([suspended,loaded,resumed]).toEqual([0,0,0]);expect(control.state.text_ready).toBe(true);await control.dispose();
});
Then('native image cleanup releases vision before restoring text after {string}',async(_world,outcome)=>{
 const calls=[];
 const abort=new AbortController();let loadedResolve;
 const inspecting=new Promise(resolve=>loadedResolve=resolve);
 const control=createVisionTool({profile:expanded.find(p=>p.id.endsWith('-native-vision')),getImage:()=>({data:'AAAA',mimeType:'image/png',width:1,height:1}),
  suspendText:async()=>{calls.push('suspend');},
  resumeText:async()=>{calls.push('resume');return !abort.signal.aborted;},
  loadVision:async()=>({generate:async(_messages,{signal})=>{
   calls.push('generate');loadedResolve();
   if(outcome==='error')throw Error('Image inference failed.');
   if(outcome==='cancel')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})),{once:true}));
   return{text:'A red square.'};
  },dispose:async()=>{calls.push('release');}})});
 const result=control.tool.execute('image-call',{image_id:'image-1',question:'What is here?'},abort.signal);
 if(outcome==='cancel'){await inspecting;abort.abort();}
 if(outcome==='success')expect((await result).details.observations).toBe('A red square.');
 else await expect(result).rejects.toThrow(outcome==='cancel'?'cancelled':'Image inference failed.');
 expect(calls).toEqual(['suspend','generate','release','resume']);expect(control.state.cleanup_failed).toBe(false);
 expect(control.state.text_ready).toBe(outcome!=='cancel');await control.dispose();
});
