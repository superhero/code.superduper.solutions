// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from 'quickpickle';
import {expect} from 'vitest';
import profiles from '../../src/lib/assistant/browser/expanded-catalog.json';
import {mergeToolDeltas,localStream} from '../../src/lib/assistant/browser/reference/adapters.js';
import {BrowserAgentHarness} from '../../src/lib/assistant/harness.ts';
import {ModelCleanupBoundary,hasCleanupFailure} from '../../src/lib/assistant/browser/cleanup.js';
import {loadWithFallback} from '../../src/lib/assistant/browser/reference/execution.js';
import {createDecisionEngine} from '../../src/lib/assistant/browser/reference/expanded/decisions.js';
import {createWorkerEngine} from '../../src/lib/assistant/browser/worker-engine.ts';
import {createVisionTool} from '../../src/lib/assistant/browser/reference/expanded/vision-tool.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const profile=profiles.find(p=>p.id==='ox-browser-lfm25-vision-compatible');
Then('fragmented invalid native calls cannot execute an editor tool',async()=>{
 let executed=0,round=0;const calls=[];
 mergeToolDeltas(calls,[{index:0,id:'invalid',function:{name:'read_',arguments:'{'},errors:['invalid native prefix']}]);
 mergeToolDeltas(calls,[{index:0,function:{name:'probe',arguments:'}'},errors:['native call rejected']}]);
 const native={kind:'wllama',async generate(_messages,{onText}){if(!round++)return{message:{content:'',tool_calls:calls},usage:{},finish_reason:'tool_calls'};onText('REJECTED');return{message:{content:'REJECTED'},usage:{},finish_reason:'stop'};}};
 const plugin={model:(id,contextWindow)=>({id,name:id,provider:'browser',api:'openai-completions',baseUrl:'',input:['text'],reasoning:false,contextWindow,maxTokens:64,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}),stream:localStream(native,{maxTokens:64,responseTimeoutMs:10000,generation:{}},[])};
 let text='';await new BrowserAgentHarness().run(plugin,'fixture',[{role:'user',content:'Read the probe.'}],new AbortController().signal,part=>text+=part,{instructions:'Use the offered tool.',contextWindow:4096,tools:[{name:'read_probe',label:'Read probe',description:'Read a local probe.',parameters:{type:'object',properties:{},additionalProperties:false},async execute(){executed++;return{content:[{type:'text',text:'unsafe'}],details:{}};}}],onTool(){},onUsage(){},maxModelTurns:3,maxToolCalls:3});
 expect(calls[0].errors).toEqual(['invalid native prefix','native call rejected']);expect(executed).toBe(0);expect(text).toBe('REJECTED');
});
Then('model release shares its native disposal and retains ownership until completion',async()=>{
 const boundary=new ModelCleanupBoundary(),gate=deferred(),events=[];
 const resource={engine:{async dispose(){events.push('dispose');await gate.promise;}},urls:['blob:owned'],revoke:url=>events.push(url),release:async()=>events.push('release')};
 const first=boundary.release(resource),second=boundary.release(resource);expect(first).toBe(second);await tick();expect(events).toEqual(['dispose']);
 gate.resolve();await Promise.all([first,second,boundary.ready()]);expect(events).toEqual(['dispose','blob:owned','release']);
});
Then('failed native cleanup retains its resources and blocks another model',async()=>{
 const boundary=new ModelCleanupBoundary(),events=[];
 const resource={engine:{async dispose(){throw Error('native exit failed');}},urls:['blob:keep'],revoke:()=>events.push('revoke'),release:async()=>events.push('release')};
 await expect(boundary.release(resource)).rejects.toThrow(/Reload this page/);await expect(boundary.ready()).rejects.toThrow(/native exit failed/);expect(()=>boundary.assertUsable()).toThrow(/Reload/);expect(events).toEqual([]);
 const again=boundary.release(resource);await expect(again).rejects.toThrow(/native exit failed/);
});
Then('a native load cleanup failure prevents further allocation attempts',async()=>{
 let creates=0;const failure=await loadWithFallback([{mode:'gpu',label:'GPU'},{mode:'hybrid',label:'Legacy fallback'}],()=>{creates++;return{async load(){throw Error('out of memory');},async dispose(){throw Error('exit failed');}};}).catch(error=>error);
 expect(hasCleanupFailure(failure)).toBe(true);expect(creates).toBe(1);expect(failure.originalError.message).toBe('out of memory');
});
Then('native decision loading reports unconfirmed cleanup instead of discarding it',async()=>{
 let exits=0;class Wllama{async loadModel(){throw Error('invalid native fixture');}async exit(){exits++;throw Error('native exit failed');}}
 const p=profiles.find(p=>p.id==='kt-browser-decision-d3-lite-gguf-bf16');
 const error=await createDecisionEngine(p,{Wllama,wasmUrl:'blob:owned',files:[],readArtifact:async()=>new ArrayBuffer(0),localFetch:async()=>{throw Error('No network');},signal:new AbortController().signal,onProgress(){}}).catch(error=>error);
 expect(hasCleanupFailure(error)).toBe(true);expect(error.message).toContain('Reload this page');expect(exits).toBe(1);
});
function workerFixture(){const instances=[];class Worker{constructor(){this.terminated=0;this.messages=[];instances.push(this);}postMessage(data){this.messages.push(data);if(data.type==='load')queueMicrotask(()=>this.onmessage({data:{id:data.id,type:'result',result:{}}}));}terminate(){this.terminated++;}}return{Worker,instances};}
Then('concurrent worker cleanup waits for one reply and preserves disposal failure',async()=>{
 const old=globalThis.Worker,h=workerFixture();globalThis.Worker=h.Worker;
 try{
  const p=profiles.find(p=>p.id==='lj-browser-lfm3-d1-omni')??{engine:'lfm3-onnx',category:'decision',settings:{}};
  const engine=await createWorkerEngine(p,[],{worker:'blob:owned'},()=>{},new AbortController().signal),worker=h.instances[0];
  const first=engine.dispose(),second=engine.dispose();expect(first).toBe(second);await tick();expect(worker.messages.filter(m=>m.type==='dispose')).toHaveLength(1);
  const request=worker.messages.at(-1);worker.onmessage({data:{id:request.id,type:'error',message:'session release failed'}});
  await expect(first).rejects.toThrow('session release failed');await expect(second).rejects.toThrow('session release failed');await expect(engine.dispose()).rejects.toThrow('session release failed');expect(worker.terminated).toBe(1);
 }finally{globalThis.Worker=old;}
});
Then('worker load cancellation terminates its owned worker once',async()=>{
 const old=globalThis.Worker,h=workerFixture();h.Worker.prototype.postMessage=function(data){this.messages.push(data);};globalThis.Worker=h.Worker;
 try{const controller=new AbortController(),loading=createWorkerEngine({engine:'lfm3-onnx',category:'decision',settings:{}},[],{worker:'blob:owned'},()=>{},controller.signal);controller.abort();await expect(loading).rejects.toMatchObject({name:'AbortError'});expect(h.instances[0].terminated).toBe(1);}finally{globalThis.Worker=old;}
});
Then('compatible image tools pass their 128 token budget to loading and generation',async()=>{
 const budgets=[];const control=createVisionTool({profile,getImage:()=>({data:'AAAA',mimeType:'image/png',width:1,height:1}),suspendText:async()=>{},resumeText:async()=>true,loadVision:async(_p,options)=>{budgets.push(options.outputTokens);return{generate:async(_messages,options)=>{budgets.push(options.maxTokens);return{text:'red'};},dispose:async()=>{}};}});
 await control.tool.execute('image',{image_id:'image-1',question:'Describe it.'});expect(budgets).toEqual([128,128]);await control.dispose();
});
Then('late image cancellation shares cleanup and cannot restart text',async()=>{
 const gate=deferred(),releasing=deferred();let disposals=0,resumed=0;
 const control=createVisionTool({profile,getImage:()=>({data:'AAAA',mimeType:'image/png',width:1,height:1}),suspendText:async()=>{},resumeText:async({signal})=>{if(!signal.aborted)resumed++;return false;},loadVision:async()=>({generate:async()=>({text:'red'}),dispose:async()=>{disposals++;releasing.resolve();await gate.promise;}})});
 const running=control.tool.execute('image',{image_id:'image-1',question:'Describe it.'});const result=running.catch(error=>error);await releasing.promise;
 const first=control.dispose(),second=control.dispose();await tick();expect(disposals).toBe(1);gate.resolve();await Promise.all([first,second]);expect((await result).name).toBe('AbortError');expect(resumed).toBe(0);expect(control.state.text_ready).toBe(false);
});
