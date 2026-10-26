// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Then } from '@cucumber/cucumber';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import { BROWSER_PROFILES as ALL_BROWSER_PROFILES, VISION_PROFILES, DECISION_PROFILES, ALL_MODEL_PROFILES, artifactsFor } from './catalog.ts';
import { defaultSettings, configuredProfile, validateSettings, samplingOptions, webmlLoadOptions, wllamaLoadOptions } from './reference/settings.js';
import { compatibilityFor } from './reference/compatibility.js';
import { executionPlans, loadWithFallback, abortableGeneration } from './reference/execution.js';
import { wireMessages, piCalls, mergeToolDeltas, localStream, loadEngine } from './reference/adapters.js';
import { BrowserAgentHarness } from '../harness.ts';
import { repositoryTools } from '../tools.ts';
import { skillTools } from '../skill-tools.ts';
import { parseSkill } from '../skills.ts';
import { validateConnection, BROWSER_CONNECTION } from '../connections.ts';
import { normalizeContexts } from '../configuration.ts';
import { runBrowserTurn, runtimeBusy, unloadBrowserModel, loadBrowserModel } from './runtime.ts';
import { prepareBrowserModel } from './selection.ts';
import { modelProgress } from './progress.ts';
import { BrowserWorkQueue } from './queue.ts';
Then('native GPU exhaustion suggests freeing memory without hiding its allocator diagnostic',async function(){
  const {createDecisionEngine}=await import('./reference/expanded/decisions.js');let exited=0;
  class Native{
    constructor(config,{logger}){this.logger=logger;}
    async loadModel(){this.logger.error('vkAllocateMemory failed with VK_ERROR_OUT_OF_DEVICE_MEMORY');throw new WebAssembly.RuntimeError('(ABORT)');}
    async exit(){exited++;}
  }
  await assert.rejects(createDecisionEngine(DECISION_PROFILES.find(profile=>profile.runtime_id==='d3'),{
    Wllama:Native,wasmUrl:'fixture',files:[],readArtifact:async()=>{},localFetch:async()=>{},signal:new AbortController().signal,onProgress:()=>{},
  }),error=>/Not enough GPU memory.*Free GPU memory/.test(error.message)&&/VK_ERROR_OUT_OF_DEVICE_MEMORY/.test(error.cause.message)&&error.cause.cause instanceof WebAssembly.RuntimeError);
  assert.equal(exited,1);
});
Then('a blocked native decision stops at its scoring deadline and releases its worker',async function(){
  const {createDecisionEngine}=await import('./reference/expanded/decisions.js');
  const base=DECISION_PROFILES.find(profile=>profile.runtime_id==='d3'),profile={...base,settings:{...base.settings,decision_timeout_ms:20}};let exited=0,entered=false;
  class Native{
    async loadModel(){}getLoadedContextInfo(){return{n_layer:1,n_ctx:1024,n_vocab:100};}
    getModelMetadata(){return{meta:{'qwen35.decision.type':'vllm-d3','qwen35.attention.causal':'false'}};}
    async inspectSystemOne(){return{tasks:[{question_id:'q',variant:0,input_tokens:1,tokens:[1]}],diagnostics:{decode_calls:0,tasks_posted:0,no_forward:true,text_only:true,format:'native-systemone'}};}
    createSystemOne(){entered=true;return new Promise(()=>{});}async exit(){exited++;}
  }
  const engine=await createDecisionEngine(profile,{Wllama:Native,wasmUrl:'fixture',files:[],readArtifact:async()=>{},localFetch:async()=>{},signal:new AbortController().signal,onProgress:()=>{}});
  await assert.rejects(engine.score({state:'Choose',questions:{q:{type:'choice',criteria:{a:'A',b:'B'}}}},new AbortController().signal),/timed out/);
  assert.equal(entered,true);assert.equal(exited,1);assert.equal(engine.invalidated,true);await engine.dispose();assert.equal(exited,1);
});
Then('native decision load failures report the allocation error after cleanup',async function(){
  const {createDecisionEngine}=await import('./reference/expanded/decisions.js');let exited=0;
  const failure=new WebAssembly.RuntimeError('(ABORT)');
  class FailingNative{
    constructor(config,{logger}){this.logger=logger;}
    async loadModel(){this.logger.error('GPU buffer allocation failed: insufficient memory');throw failure;}
    async exit(){exited++;}
  }
  await assert.rejects(createDecisionEngine(DECISION_PROFILES.find(profile=>profile.runtime_id==='d3'),{
    Wllama:FailingNative,wasmUrl:'blob:verified',files:[],readArtifact:async()=>{},localFetch:async()=>{},
    signal:new AbortController().signal,onProgress:()=>{},
  }),error=>error.name==='RuntimeError'&&error.cause===failure&&/insufficient memory/.test(error.message));
  assert.equal(exited,1);
});
Then('the real Transformers tokenizer loads only from the pinned vision revision',async function(){
  const library=await import('@huggingface/transformers');
  const {loadVisionRuntime}=await import('./reference/expanded/vision-worker.js');
  const pin={repo:'test/installed-vision',revision:'a'.repeat(40),chatTemplate:{filename:'chat_template.jinja'},sessionFiles:{embed_tokens:'embed_tokens',vision_encoder:'embed_images',decoder_model_merged:'decoder'},dtype:{}};
  const base=`https://huggingface.co/${pin.repo}/resolve/${pin.revision}/`,requests=[];
  const files={'tokenizer.json':{version:'1.0',model:{type:'WordLevel',vocab:{'[UNK]':0,hello:1},unk_token:'[UNK]'},pre_tokenizer:{type:'Whitespace'},normalizer:null,post_processor:null,decoder:{type:'WordPiece',prefix:'##',cleanup:true},added_tokens:[]},'tokenizer_config.json':{tokenizer_class:'PreTrainedTokenizer',unk_token:'[UNK]',model_max_length:1024}};
  const keys=['fetch','allowLocalModels','useFSCache','useBrowserCache','remotePathTemplate'];
  const previous=Object.fromEntries(keys.map(key=>[key,library.env[key]]));
  Object.assign(library.env,{allowLocalModels:false,useFSCache:false,useBrowserCache:false,fetch:async url=>{
    requests.push(String(url));assert.ok(String(url).startsWith(base),`Unpinned SDK lookup: ${url}`);
    const value=files[String(url).slice(base.length)];assert.ok(value,`Unexpected SDK file: ${url}`);
    return Response.json(value);
  }});
  try{
    const runtime=await loadVisionRuntime({...library,
      AutoConfig:{from_pretrained:async()=>({})},
      PreTrainedModel:{from_pretrained:async()=>({sessions:{model:{outputNames:['inputs_embeds','image_features','logits']}}})},
      Lfm2VlImageProcessor:class{},Lfm2VlProcessor:class{},
      Lfm2VlForConditionalGeneration:class{constructor(config,sessions){this.sessions=sessions;}},
    },pin,{fetchJSON:async()=>({image_processor:{}}),fetchText:async()=>''});
    assert.deepEqual(Array.from(runtime.tokenizer('hello',{add_special_tokens:false}).input_ids.data),[1n]);
    assert.ok(requests.length>=3);assert.ok(requests.every(url=>url.startsWith(base)));
  }finally{Object.assign(library.env,previous);}
});
Then('native model progress maps loaded counts and keeps their measurement units',function(){
  assert.deepEqual(modelProgress({status:'weights',kind:'bytes',loaded:2048,total:8192,fraction:.25,message:'Streaming weights'}),
    {message:'Streaming weights',received:2048,total:8192,unit:'bytes'});
  assert.deepEqual(modelProgress({status:'weights',kind:'tensors',loaded:12,total:48,message:'Uploading to GPU'}),
    {message:'Uploading to GPU',received:12,total:48,unit:'tensors'});
  assert.deepEqual(modelProgress({message:'Downloading model',received:4096,total:8192}),
    {message:'Downloading model',received:4096,total:8192,unit:'bytes'});
});
Then('model loading progress without valid counts remains indeterminate',function(){
  for(const counters of [{},{loaded:1,total:null},{loaded:NaN,total:100},{loaded:1,total:0},{loaded:-1,total:100},{loaded:1,total:Infinity}])
    assert.deepEqual(modelProgress({message:'Preparing weight upload',...counters}),{message:'Preparing weight upload'});
  assert.deepEqual(modelProgress({message:'Streaming weights',loaded:0,total:100}),{message:'Streaming weights',received:0,total:100,unit:'bytes'});
});
Then('choosing a browser model that is {string} prepares it for inference',async function(availability){
  const id=BROWSER_PROFILES[0].id,events=[],progress=()=>{},controller=new AbortController();
  const adapters={installedModels:async()=>availability==='installed'?[id]:[],
    installBrowserModel:async(model,callback,signal)=>{assert.equal(model,id);assert.equal(callback,progress);assert.equal(signal,controller.signal);events.push('install');},
    loadBrowserModel:async(model,callback,signal,context)=>{assert.equal(model,id);assert.equal(signal,controller.signal);assert.equal(context,8192);events.push('load');}};
  await prepareBrowserModel(id,progress,controller.signal,8192,adapters);
  assert.deepEqual(events,availability==='installed'?['load']:['install','load']);
});
Then('cancelling model installation stops selected-model loading',async function(){
  const controller=new AbortController();let loaded=false;
  await assert.rejects(prepareBrowserModel(BROWSER_PROFILES[0].id,()=>{},controller.signal,4096,{
    installedModels:async()=>[],installBrowserModel:async()=>{controller.abort();},loadBrowserModel:async()=>{loaded=true;},
  }),{name:'AbortError'});
  assert.equal(loaded,false);
});
const BROWSER_PROFILES = ALL_BROWSER_PROFILES.slice(0,6);
const signal = () => new AbortController().signal;
Then('the browser model catalog retains all six handoff pins and their image limitations', function () {
  assert.equal(BROWSER_PROFILES.length,6);
  assert.deepEqual(BROWSER_PROFILES.map(p=>p.engine),['webml','webml','webml','webml','wllama','wllama']);
  for(const p of BROWSER_PROFILES) {
    assert.match(p.revision,/^[0-9a-f]{40}$/);assert.match(p.weight_sha256,/^[0-9a-f]{64}$/);
    assert.match(p.projector.sha256,/^[0-9a-f]{64}$/);assert.ok(p.evidence.run_id);assert.equal(p.evidence.attempt,p.id);
    assert.ok(artifactsFor(p).every(file=>file.bytes>0 && /^[0-9a-f]{64}$/.test(file.sha256)));
    if(p.engine==='webml') assert.equal(p.runtime_source.sha256,'00c1a72a962a84fee17000a6b1d18b24d75033e56d59996fc504b7c57cfc6488');
    else {assert.equal(p.runtime_source.source_revision,'3bb2a46f0dab0b924e8cd992b85e8881c3d3a859');assert.equal(p.runtime_source.llama_cpp,'970b51ce7c9ba5fff0726c5e9994f1c2f0e4eedc');}
  }
  for(const p of BROWSER_PROFILES.slice(0,3)) assert.match(p.limitations,/OCR cards failed/);
  assert.match(BROWSER_PROFILES[3].limitations,/OCR cards passed/);
  for(const p of BROWSER_PROFILES.slice(4)) assert.match(p.limitations,/OCR was not tested/);
});
Then('native browser settings follow the explicit engine and preserve weight revisions', function () {
  for(const p of BROWSER_PROFILES) {
    const before=JSON.stringify(p), settings=defaultSettings(p,{context_tokens:3072,thinking:true,top_k:12,sampling_mode:'sample',temperature:.8});
    const configured=configuredProfile(p,settings);
    assert.equal(JSON.stringify(p),before);assert.equal(configured.file,p.file);assert.equal(configured.revision,p.revision);assert.deepEqual(configured.projector,p.projector);
    assert.equal(samplingOptions(settings,p.engine).temperature,.8);
    if(p.engine==='webml') {assert.equal(webmlLoadOptions(configured,()=>{}).maxLength,3072);assert.equal(webmlLoadOptions(configured,()=>{}).mmproj,p.projector.file);}
    else {const native=wllamaLoadOptions(configured.settings);assert.equal(native.n_ctx,3072);assert.equal(native.reasoning,true);}
  }
  const ornithAsWebML={...BROWSER_PROFILES[4],engine:'webml'};
  assert.throws(()=>defaultSettings(ornithAsWebML,{cpu_threads:4}),/Unknown/);
  assert.equal(defaultSettings({...BROWSER_PROFILES[0],engine:'wllama'},{cpu_threads:2}).cpu_threads,2);
});
Then('browser model settings reject invalid or unknown controls', function () {
  for(const p of BROWSER_PROFILES) for(const invalid of [{context_tokens:0},{top_k:-1},{temperature:NaN},{turn_timeout_ms:3600001},{arbitrary_code:'x'}, {max_tool_calls:0}])
    assert.throws(()=>validateSettings(p,{...defaultSettings(p),...invalid}));
  assert.throws(()=>defaultSettings(BROWSER_PROFILES[0],{top_k:65}),/top_k/);
  assert.throws(()=>defaultSettings(BROWSER_PROFILES[4],{batch_tokens:128,micro_batch_tokens:256}),/Micro batch/);
});
const facts={secure:true,isolated:true,wasm:true,simd:true,threads:true,jspi:true,memory64:true,browser:{name:'Chromium',version:'155'},gpu:{compute:true,f16_compute:true,info:{}}};
Then('browser compatibility separates actual GPU capabilities from unknown memory and driver facts', function () {
  const minimal={...facts,isolated:false,wasm:false,simd:false,threads:false,jspi:false,memory64:false,gpu:{compute:true,f16_compute:false}};
  assert.equal(compatibilityFor(minimal,BROWSER_PROFILES[0]).ready,true);
  assert.equal(compatibilityFor(minimal,BROWSER_PROFILES[4]).ready,false);
  for(const p of BROWSER_PROFILES) {
    const report=compatibilityFor(facts,p);assert.equal(report.ready,true);
    for(const id of ['memory','driver']) assert.equal(report.rows.find(row=>row.id===id).state,'info');
  }
  assert.equal(compatibilityFor({...facts,gpu:{compute:false}},BROWSER_PROFILES[0]).ready,false);
});
Then('browser execution plans preserve the CPU heap limit and partial offload choices', function () {
  for(const p of BROWSER_PROFILES.slice(4)) {
    assert.throws(()=>executionPlans(p,facts,{mode:'cpu'}),/4GiB/);
    assert.throws(()=>executionPlans(p,{gpu:{compute:false}},{mode:'auto'}),/4GiB/);
    assert.deepEqual(executionPlans(p,facts).map(plan=>plan.mode),['gpu','hybrid']);
    assert.equal(executionPlans(p,facts,{mode:'hybrid',gpuLayers:20,visionGpu:false})[0].vision_gpu_offload,false);
  }
});
Then('browser engine fallback disposes failed instances and retries allocation errors only', async function () {
  for(const [error,expected] of [[Error('GPU out of memory'),['gpu','dispose:gpu','hybrid']],[Error('HTTP503'),['gpu','dispose:gpu']]]) {
    const events=[];const work=loadWithFallback(executionPlans(BROWSER_PROFILES[4],facts),plan=>({async load(){events.push(plan.mode);if(plan.mode==='gpu')throw error;return{};},async dispose(){events.push('dispose:'+plan.mode);}}));
    if(expected.length===2) await assert.rejects(work,/HTTP503/);else await work;
    assert.deepEqual(events,expected);
  }
});
Then('aborting a blocked browser generator unloads it without waiting', async function () {
  let disposed=false;const controller=new AbortController();
  const work=abortableGeneration(()=>new Promise(()=>{}),controller.signal,async()=>disposed=true);
  controller.abort();await assert.rejects(work,/model unloaded/);assert.equal(disposed,true);
});
Then('browser tool translation preserves native arguments identities and result replay', async function () {
  const context=normalizeContext({systemPrompt:'Use tools.',tools:[],messages:[{role:'assistant',content:[{type:'toolCall',id:'a',name:'read_file',arguments:{path:'README.md'}}]}, {role:'toolResult',toolCallId:'a',toolName:'read_file',content:[{type:'text',text:'Private result'}]}]});
  for(const engine of ['webml','bonsai','wllama','ornith']) {
    const wire=await wireMessages(context,engine),expected=['wllama','ornith'].includes(engine)?'{"path":"README.md"}':{path:'README.md'};
    assert.deepEqual(wire[1].tool_calls[0].function.arguments,expected);assert.equal(wire[2].tool_call_id,'a');assert.equal(wire[2].content,'Private result');
  }
  const deltas=[];mergeToolDeltas(deltas,[{index:0,id:'a',function:{name:'read_file',arguments:'{"path":'}}]);mergeToolDeltas(deltas,[{index:0,function:{arguments:'"README.md"}'}}]);
  assert.deepEqual(piCalls(deltas)[0].arguments,{path:'README.md'});assert.throws(()=>piCalls([{function:{name:'bad call',arguments:{}}}]),/Invalid tool name/);
  assert.throws(()=>piCalls([{function:{name:'read',arguments:'{broken'}}]));
  assert.deepEqual(piCalls([{function:{name:'read',arguments:{}},errors:['invalid path']}])[0].nativeErrors,['invalid path']);
});
Then('the editor Pi harness runs a fresh skill and repository tool exchange through {string}', async function (engine) {
  const secret=randomUUID(),seen=[],activities=[],deltas=[];
  const skills={'verify-note':parseSkill('---\nname: verify-note\ndescription: Read a fresh verification note.\n---\nRead README.md and return its exact private code.').skill};
  const native={kind:engine,async generate(messages,{onText}){
    seen.push(structuredClone(messages));const results=messages.filter(m=>m.role==='tool');
    const name=results.length===0?'load_skill':results.length===1?'read_file':null;
    const args=name==='load_skill'?{name:'verify-note'}:{path:'README.md'};
    if(!name) onText(secret);
    return {message:{content:name?'':secret,...(name?{tool_calls:[{id:'call-'+results.length,function:{name,arguments:engine==='wllama'?JSON.stringify(args):args}}]}:{})},usage:{prompt_tokens:40,completion_tokens:4},finish_reason:'stop'};
  }};
  const plugin={model:(id,contextWindow)=>({id,name:id,provider:'browser',api:'openai-completions',baseUrl:'',input:['text','image'],reasoning:false,contextWindow,maxTokens:128,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}),stream:localStream(native,{maxTokens:128,responseTimeoutMs:10000,generation:{}},[])};
  const tools=[...skillTools(skills),...repositoryTools({id:'repo',revision:'a',files:new Set(['README.md']),read:async()=>secret})];
  await new BrowserAgentHarness().run(plugin,'fixture',[{role:'user',content:'Use verify-note.'}],signal(),d=>deltas.push(d),{instructions:'Read enabled skills and files.',skills,contextWindow:8192,tools,onUsage(){},onTool:a=>activities.push(a),maxToolCalls:8,maxModelTurns:6});
  assert.equal(deltas.join(''),secret);assert.equal(seen.length,3);assert.doesNotMatch(JSON.stringify(seen[0]),new RegExp(secret));
  assert.match(seen[1].at(-1).content,/Read README.md/);assert.match(seen[2].at(-1).content,new RegExp(secret));
  assert.deepEqual(activities.map(a=>a.status),['running','completed','running','completed']);
});
Then('browser connections and context preferences remain local and credential free', function () {
  assert.deepEqual(validateConnection({...BROWSER_CONNECTION,credentialId:'must-not-persist',address:'https://example.test'}),BROWSER_CONNECTION);
  const key='browser:'+BROWSER_PROFILES[0].id;assert.deepEqual(normalizeContexts({[key]:8192}),{[key]:8192});
});
Then('browser turns and unloads wait in order until the current tool work finishes', async function () {
  const events=[];let finishTools;const tools=new Promise(resolve=>finishTools=resolve);
  const turn=runBrowserTurn(async()=>{events.push('generate:first');await tools;events.push('tools:finished');});
  assert.equal(runtimeBusy(),true);
  const next=runBrowserTurn(async()=>{events.push('generate:second');});
  const unload=unloadBrowserModel().then(()=>events.push('unload'));
  const controller=new AbortController();
  const cancelled=loadBrowserModel(BROWSER_PROFILES[0].id,()=>{},controller.signal);
  controller.abort();await assert.rejects(cancelled,{name:'AbortError'});
  assert.deepEqual(events,['generate:first']);
  finishTools();await Promise.all([turn,next,unload]);assert.equal(runtimeBusy(),false);
  assert.deepEqual(events,['generate:first','tools:finished','generate:second','unload']);
  await assert.rejects(runBrowserTurn(async()=>{throw Error('fixture');}),/fixture/);assert.equal(runtimeBusy(),false);
  await assert.rejects(loadBrowserModel('unknown-profile',()=>{},signal()),/Unknown browser model/);assert.equal(runtimeBusy(),false);
});
Then('cancelled browser jobs are skipped and failures do not block later jobs', async function () {
  const queue=new BrowserWorkQueue(),events=[];let finish;
  const activeController=new AbortController(),waitingController=new AbortController();
  const active=queue.run(async()=>{events.push('active');await new Promise(resolve=>finish=resolve);events.push('cleanup');},activeController.signal);
  const cancelled=queue.run(async()=>{events.push('cancelled');},waitingController.signal);
  const rejected=queue.run(async()=>{events.push('error');throw Error('fixture failure');});
  const failure=assert.rejects(rejected,/fixture failure/);
  const last=queue.run(async()=>events.push('next'));
  waitingController.abort();await assert.rejects(cancelled,{name:'AbortError'});
  activeController.abort();assert.deepEqual(events,['active']);assert.equal(queue.busy,true);
  finish();await Promise.all([active,failure,last]);assert.deepEqual(events,['active','cleanup','error','next']);assert.equal(queue.busy,false);
  await assert.rejects(queue.run(async()=>events.push('already aborted'),waitingController.signal),{name:'AbortError'});
  assert.equal(events.length,4);
});
Then('the optional browser runtime matches its reviewed build receipt', async function () {
  const {verifyBrowserRuntime}=await import('../../../../build/browser-models.mjs');await verifyBrowserRuntime();
  assert.match(await readFile('src/public/browser-models/wllama/LICENCE','utf8'),/Permission is hereby granted/);
});
Then('the {string} browser profile loads and streams through its native API contract', async function (id) {
  const pinned=BROWSER_PROFILES.find(profile=>profile.id===id),profile=configuredProfile(pinned,defaultSettings(pinned));
  const seen={},nativeResult={message:{content:'Ready'},finish_reason:'stop',usage:{prompt_tokens:5,completion_tokens:1}};
  const webmlModule={Qwen3_5ForConditionalGeneration:{async from_pretrained(model,options){
    seen.model=model;seen.load=options;
    return {contextLength:profile.settings.context_tokens,deviceInfo:()=>({fixture:true}),create_session:()=>({
      reset(){},async dispose(){seen.disposed=true;},generate(messages,options){seen.messages=messages;seen.generation=options;return {async *[Symbol.asyncIterator](){yield {type:'text',text:'Ready'};},result:Promise.resolve(nativeResult)};},
    }),async dispose(){seen.disposed=true;}};
  }}};
  class Wllama {
    constructor(paths){seen.paths=paths;}
    async loadModel(blobs,options){seen.load=options;seen.sizes=blobs.map(blob=>blob.size);await blobs[0].slice(8,16).arrayBuffer();}
    getLoadedContextInfo(){return {n_layer:32,n_ctx:profile.settings.context_tokens,n_vocab:100,has_image_input:true};}
    async createChatCompletion(options){seen.messages=options.messages;seen.generation=options;options.onData({choices:[{delta:{content:'Ready'},finish_reason:'stop'}],usage:nativeResult.usage});}
    async exit(){seen.disposed=true;}
  }
  const localFetch=()=>{throw Error('Unexpected runtime network access');};
  const files=artifactsFor(profile),engine=await loadEngine(profile,()=>{}, {mode:'auto',gpuLayers:24,visionGpu:true,capabilities:facts,webmlModule,Wllama,wasmUrl:'blob:verified-local-wasm',localFetch,files,signal:signal(),readArtifact:async(file,start,end)=>{seen.read=[file.id,start,end];return new ArrayBuffer(end-start);}});
  const plugin={model:(modelId,contextWindow)=>({id:modelId,name:modelId,provider:'browser',api:'openai-completions',baseUrl:'',input:['text','image'],reasoning:false,contextWindow,maxTokens:128,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}),stream:localStream(engine,{maxTokens:128,responseTimeoutMs:5000,generation:profile.settings},[])};
  const deltas=[];
  await new BrowserAgentHarness().run(plugin,id,[{role:'user',content:'Ready?'}],signal(),text=>deltas.push(text),{instructions:'Answer.',contextWindow:4096,tools:[],onTool(){},onUsage(){}});
  assert.equal(deltas.join(''),'Ready');assert.equal(seen.messages.at(-1).content,'Ready?');
  if(profile.engine==='webml') {assert.equal(seen.model,pinned.model);assert.equal(seen.load.revision,pinned.revision);assert.equal(seen.load.mmproj,pinned.projector.file);assert.equal(seen.load.fetch,localFetch);assert.equal(seen.load.cache,false);}
  else {assert.deepEqual(seen.sizes,[pinned.weight_bytes,pinned.projector.bytes]);assert.deepEqual(seen.read,[pinned.file,8,16]);assert.equal(seen.load.n_gpu_layers,99);assert.equal(seen.paths.default,'blob:verified-local-wasm');}
  await engine.dispose();assert.equal(seen.disposed,true);
});

Then('the expanded catalog exposes eight LLMs one LFM vision tool and nine native decision profiles', function () {
  assert.equal(ALL_BROWSER_PROFILES.length,8); assert.equal(VISION_PROFILES.length,1); assert.equal(DECISION_PROFILES.length,9);
  assert.equal(ALL_MODEL_PROFILES.length,18); assert.equal(new Set(ALL_MODEL_PROFILES.map(p=>p.id)).size,18);
  for (const profile of ALL_MODEL_PROFILES) for (const file of artifactsFor(profile)) {
    assert.ok(file.bytes>0); assert.match(file.sha256,/^[a-f0-9]{64}$/);
    if(file.kind==='weights') assert.match(file.url,/\/resolve\/[a-f0-9]{40}\//);
    if(file.parts) {assert.equal(file.parts.reduce((sum,p)=>sum+p.bytes,0),file.bytes);for(const part of file.parts.slice(0,-1)) assert.equal(part.bytes % (8*1024*1024),0);}
  }
  const [gemma,mini]=ALL_BROWSER_PROFILES.slice(6);
  assert.equal(gemma.engine,'litert-lm');assert.equal(gemma.runtime_source.version,'0.18.0');assert.equal(mini.parameters,'2.52B');
  for(const p of [gemma,mini]) {assert.equal(p.projector,null);assert.equal(p.vision_tool,VISION_PROFILES[0].id);}
  assert.equal(VISION_PROFILES[0].revision,'d0e00ca26cc42892d9f3c4380faa631927218209');
  assert.deepEqual(DECISION_PROFILES.filter(p=>p.engine==='strands-onnx').map(p=>p.browser_probe.device),['webgpu','wasm']);
  assert.ok(DECISION_PROFILES.filter(p=>p.runtime_id==='d3').every(p=>artifactsFor(p).some(f=>f.url.includes('wllama-d3/'))));
  assert.equal(ALL_MODEL_PROFILES.some(p=>/450M|cached-cpu/.test(p.id)),false);
});
Then('Gemma rejects unsupported controls and MiniCPM loads without a vision projector', async function () {
  const settings=await import('./settings.js'),[gemma,mini]=ALL_BROWSER_PROFILES.slice(6);
  for(const override of [{thinking:true},{sampling_mode:'sample'},{prefix_cache:true},{context_tokens:8192},{max_new_tokens:4096}]) assert.throws(()=>settings.defaultSettings(gemma,override));
  const profile=settings.configuredProfile(gemma,settings.defaultSettings(gemma,{context_tokens:3072}));
  assert.equal(profile.settings.temperature,0);assert.equal(profile.settings.prefix_cache,false);assert.equal(profile.settings.thinking,false);
  assert.deepEqual(executionPlans(mini,facts).map(p=>[p.mode,p.gpu_layers]),[['gpu',99],['hybrid',8],['cpu',0]]);
  let weights,loadOptions;
  class Native {async loadModel(files,options){weights=files;loadOptions=options;}getLoadedContextInfo(){return {n_layer:42,n_ctx:4096,n_vocab:100,has_image_input:false};}async exit(){}}
  const configured=settings.configuredProfile(mini,settings.defaultSettings(mini));
  const engine=await loadEngine(configured,()=>{},{capabilities:facts,Wllama:Native,wasmUrl:'blob:fixture',files:artifactsFor(mini),readArtifact:async()=>new ArrayBuffer(0),signal:signal()});
  assert.equal(weights.length,1);assert.equal(loadOptions.n_gpu_layers,99);assert.equal(engine.kind,'wllama');await engine.dispose();
});
Then('LFM image inspection uses local image identifiers and restores text after its actual Pi tool call', async function () {
  const {createVisionTool}=await import('./reference/expanded/vision-tool.js'),{imageReferences}=await import('./image-references.ts');
  const image={type:'image',mimeType:'image/png',data:'AQID',width:80,height:40},conversation=[{role:'user',content:'Read the code',images:[image]}],refs=imageReferences(conversation),events=[];
  assert.equal(refs.reference(image).includes(image.data),false);assert.match(refs.reference(image),/image_1; 80 × 40/);
  const control=createVisionTool({profile:VISION_PROFILES[0],getImage:refs.getImage,suspendText:async()=>events.push('suspend'),resumeText:async()=>{events.push('resume');return true;},loadVision:async()=>({async generate(messages,options){events.push('inspect');assert.equal(options.image.data,'AQID');return {text:'Visible code: SECRET-739'};},async dispose(){events.push('release');}})});
  let calls=0;
  const plugin={model:(id,ctx)=>({id,name:id,provider:'browser',api:'openai-completions',baseUrl:'',input:['text'],reasoning:false,contextWindow:ctx,maxTokens:256,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}),stream:localStream({kind:'litert-lm',async generate(messages){
    assert.equal(JSON.stringify(messages).includes('AQID'),false);
    if(++calls===1)return {message:{content:'',tool_calls:[{id:'vision-call',type:'function',function:{name:'inspect_image',arguments:{image_id:'image_1',question:'Read the visible code.'}}}]},usage:{}};
    assert.ok(messages.some(m=>m.role==='tool'&&m.content.includes('SECRET-739')));return {message:{content:'SECRET-739'},usage:{},finish_reason:'stop'};
  }},{maxTokens:256,responseTimeoutMs:1000,generation:{}},[])};
  const result=await new BrowserAgentHarness().run(plugin,'gemma-fixture',[{role:'user',content:refs.reference(image)}],signal(),()=>{},{instructions:'Inspect the local image.',contextWindow:4096,tools:[control.tool],onTool:()=>{},onUsage:()=>{}});
  assert.equal(result.reason,'stop');assert.equal(calls,2);assert.deepEqual(events,['suspend','inspect','release','resume']);await control.dispose();
});
Then('cancelled LFM image inspection releases its worker before returning', async function () {
  const {createVisionTool}=await import('./reference/expanded/vision-tool.js'),events=[],controller=new AbortController();let entered;
  const ready=new Promise(resolve=>entered=resolve),control=createVisionTool({profile:VISION_PROFILES[0],getImage:()=>({mimeType:'image/png',data:'AQID',width:1,height:1}),suspendText:async()=>{},resumeText:async({signal})=>{assert.equal(signal.aborted,true);events.push('resume-skipped');return false;},loadVision:async()=>({generate(_messages,{signal}){entered();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('Stopped'),{name:'AbortError'})),{once:true}));},async dispose(){events.push('released');}})});
  const operation=control.tool.execute('cancelled',{image_id:'image_1',question:'Read'},controller.signal);await ready;controller.abort();await assert.rejects(operation,/Stopped/);assert.deepEqual(events,['released','resume-skipped']);await control.dispose();
});
Then('D3 native preflight prevents oversized forwards and decision answers require complete probabilities', async function () {
  const {createDecisionEngine,validateDecisionAnswer}=await import('./reference/expanded/decisions.js');
  const profile=DECISION_PROFILES.find(p=>p.runtime_id==='d3'),events=[];let tokens=1025;
  class Native {async loadModel(){}getLoadedContextInfo(){return {n_layer:1,n_ctx:1024,n_vocab:100};}getModelMetadata(){return {meta:{'qwen35.decision.type':'vllm-d3','qwen35.attention.causal':'false'}};}async inspectSystemOne(){return {tasks:[{question_id:'q',variant:0,input_tokens:tokens,tokens:Array(tokens).fill(1)}],diagnostics:{decode_calls:0,tasks_posted:0,no_forward:true,text_only:true,format:'native-systemone'}};}async createSystemOne(){events.push('native');return {usage:{input_tokens:tokens},answers:{q:{type:'choice',probabilities:{a:.8,b:.2},choice:'a'}}};}async exit(){events.push('dispose');}}
  const engine=await createDecisionEngine(profile,{Wllama:Native,wasmUrl:'fixture',files:artifactsFor(profile),readArtifact:async()=>new ArrayBuffer(0),localFetch:async()=>{throw Error('No prompt download expected');},signal:signal(),onProgress:()=>{}}),request={state:'Choose',questions:{q:{type:'choice',criteria:{a:'A',b:'B'}}}};
  await assert.rejects(engine.score(request,signal()),/budget|limit|context|tokens/i);assert.deepEqual(events,[]);tokens=100;assert.equal((await engine.score(request,signal())).probabilities.a,.8);assert.deepEqual(events,['native']);
  assert.throws(()=>validateDecisionAnswer({type:'choice',probabilities:{a:1}},request),/incomplete/);assert.throws(()=>validateDecisionAnswer({type:'choice',probabilities:{a:NaN,b:0}},request),/invalid/);await engine.dispose();
});

Then('a blocked decision worker stops at its configured scoring deadline',async function(){
  const {createWorkerEngine}=await import('./worker-engine.ts'),prior=globalThis.Worker;let terminated=false;
  globalThis.Worker=class{postMessage(data){if(data.type==='load')queueMicrotask(()=>this.onmessage({data:{id:data.id,type:'result',result:{}}}));}terminate(){terminated=true;}};
  try{
    const profile={...DECISION_PROFILES.find(p=>p.engine==='strands-onnx'),settings:{load_timeout_ms:1000,decision_timeout_ms:20,turn_timeout_ms:10000}};
    const engine=await createWorkerEngine(profile,[],{worker:'blob:fixture'},()=>{},signal());
    await assert.rejects(engine.request('decide',{state:'test',question:{}},signal()),/timed out/);assert.equal(terminated,true);assert.equal(engine.invalidated,true);
  }finally{if(prior===undefined)delete globalThis.Worker;else globalThis.Worker=prior;}
});
