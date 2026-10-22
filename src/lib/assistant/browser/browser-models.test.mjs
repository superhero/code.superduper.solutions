// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Then } from '@cucumber/cucumber';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import { BROWSER_PROFILES, artifactsFor } from './catalog.ts';
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
Then('concurrent browser turns and unloads are rejected until the current turn finishes', async function () {
  let release;const held=new Promise(resolve=>release=resolve);
  const turn=runBrowserTurn(()=>held);assert.equal(runtimeBusy(),true);
  await assert.rejects(runBrowserTurn(async()=>{}),/Another browser conversation/);
  await assert.rejects(unloadBrowserModel(),/Stop the current/);
  await assert.rejects(loadBrowserModel(BROWSER_PROFILES[0].id,()=>{},signal()),/Another browser model/);
  release();await turn;assert.equal(runtimeBusy(),false);
  await assert.rejects(runBrowserTurn(async()=>{throw Error('fixture');}),/fixture/);assert.equal(runtimeBusy(),false);
  await assert.rejects(loadBrowserModel('unknown-profile',()=>{},signal()),/Unknown browser model/);assert.equal(runtimeBusy(),false);
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
