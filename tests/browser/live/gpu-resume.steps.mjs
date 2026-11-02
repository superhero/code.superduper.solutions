// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {liveBrowser} from './browser-models.steps.mjs';
const gold='and so my fellow americans ask not what your country can do for you ask what you can do for your country';
const norm=text=>(text??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const expected=n=>Array(n).fill(gold).join(' ');
async function ready(page){await expect.poll(()=>page.evaluate(()=>({phase:modelLive.speech.state.phase,error:modelLive.speech.state.error})),{timeout:130000,intervals:[250,1000]}).toEqual({phase:'ready',error:''});}
async function speechSetup(){const{page,context,imports}=liveBrowser();await context.grantPermissions(['microphone']);await page.evaluate(async url=>Object.assign(modelLive,await import(url)),imports.speech);await page.evaluate(async()=>{await modelLive.runtime.unloadBrowserModel();modelLive.speech.setMode('gpu-nq');});return liveBrowser();}
async function chooseSpeech(){const{page}=liveBrowser();await page.getByRole('button',{name:'Speech model',exact:true}).click();await page.getByRole('menu',{name:'Speech model',exact:true}).locator('[data-value="gpu-nq"]').click();await ready(page);}
async function capture(page,seconds){
 await page.getByRole('button',{name:'Speech input',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>modelLive.speech.state.seconds),{timeout:(seconds+20)*1000,intervals:[250,500]}).toBeGreaterThanOrEqual(seconds);
 await page.getByRole('button',{name:'Stop dictation',exact:true}).click();await ready(page);
 return page.getByRole('textbox',{name:'Message AI',exact:true}).innerText();
}
Then('strict editor chat {string} completes genuine repository and progressive skill exchanges',async function(id){
 const{page,choose,send}=liveBrowser();this.case.model=id;const requests=[];const listen=request=>{if(/mmproj/.test(request.url()))requests.push(request.url());};page.on('request',listen);
 try{
  await choose(id);this.case.reply=await send('Reply with exactly READY.','READY');
  const secret='GPU-'+randomUUID().slice(0,8).toUpperCase();
  this.case.skillExchange=await page.evaluate(async({id,secret})=>{
   const[{repositoryClient}, {repositoryTools},{skillTools}]=await Promise.all([import('/lib/repository/client.ts'),import('/lib/assistant/tools.ts'),import('/lib/assistant/skill-tools.ts')]);
   const repository=await repositoryClient.create('GPU chat verification',[{path:'notes/session.txt',data:new TextEncoder().encode('Confirmation code: '+secret+'\nStatus: ready\n')}]);
   const calls=[],activities=[],skills={'verify-note':{description:'Read a fresh verification code from the selected repository.',enabled:true,instructions:'Read notes/session.txt with read_file. Report exactly VERIFIED followed by the entire confirmation code from that file, preserving its prefix and punctuation.'}};
   const files=repositoryTools({id:repository.id,revision:repository.revision,files:repository.files,read:path=>{calls.push(path);return repositoryClient.read(repository.id,path);}},{list_files:false,read_file:true,search_text:false});
   const harness=new modelLive.BrowserAgentHarness(),signal=new AbortController().signal;
   const settings={instructions:'Use the enabled skill when requested, loading its instructions first. Read the repository file to obtain its code. Never guess the code.',skills,contextWindow:4096,tools:[...skillTools(skills),...files],onTool:activity=>activities.push(structuredClone(activity)),onUsage:()=>{},maxModelTurns:6,maxToolCalls:8};
   let text='';await modelLive.runtime.runBrowserTurn(async load=>{await load(id,()=>{},signal);await harness.run(modelLive.runtime.browserPlugin(id,()=>{}),id,[{role:'user',content:'Use verify-note to report the confirmation code from notes/session.txt. Load the skill instructions first.'}],signal,part=>text+=part,settings);},signal);
   const info=modelLive.runtime.loadedModelInfo();return{text,calls,activities,info,repositoryId:repository.id};
  },{id,secret});
  assert.ok(this.case.skillExchange.text.trim().endsWith('VERIFIED '+secret),this.case.skillExchange.text);assert.deepEqual(this.case.skillExchange.calls,['notes/session.txt']);
  const completed=this.case.skillExchange.activities.filter(a=>a.status==='completed').map(a=>a.name);assert.deepEqual(completed,['load_skill','read_file']);
  assert.equal(this.case.skillExchange.info.placement.cpu_compute_ops,0);assert.ok(this.case.skillExchange.info.placement.gpu_compute_ops>0);assert.ok(this.case.skillExchange.info.placement.all_layers_offloaded);
  if(id.startsWith('ix-')||id.startsWith('iy-')){
   this.case.unavailableVision=await page.evaluate(async id=>{
    const{probeBrowser}=await import('/lib/assistant/browser/compatibility.js'),facts=await probeBrowser();if(facts.gpu.f16_compute)throw Error('This check requires the documented no-FP16 Brave device.');
    const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;const image={type:'image',data:canvas.toDataURL('image/png').split(',')[1],mimeType:'image/png',width:16,height:16};
    const control=await modelLive.runtime.browserVisionTool(id,[{role:'user',content:'Image',images:[image]}],()=>{});let error='';
    try{await control.tool.execute('vision-probe',{image_id:'image_1',question:'What is visible?'},new AbortController().signal);}catch(e){error=e.message;}finally{await control.dispose();}
    return{error,loaded:modelLive.runtime.loadedModel(),placement:modelLive.runtime.loadedModelInfo()?.placement};
   },id);
   assert.match(this.case.unavailableVision.error,/FP16|shader-f16/);assert.equal(this.case.unavailableVision.loaded,id);
  }
  assert.deepEqual(requests,[]);this.case.projectorRequests=requests;
 }finally{page.off('request',listen);}
});
Then('the editor continuously dictates 75 seconds and drains a 600 second durable backlog',async function(){
 const{page,context,imports}=await speechSetup();await page.getByRole('button',{name:'New chat',exact:true}).click();await chooseSpeech();
 await page.evaluate(()=>{
  const Original=AudioWorkletNode;globalThis.capturedSpeech=[];globalThis.AudioWorkletNode=class extends Original{constructor(...args){super(...args);if(args[1]==='pcm-capture')this.port.addEventListener('message',({data})=>{if(data.type==='pcm')capturedSpeech.push(data.pcm.slice());});}};
  globalThis.stableDrafts=[];const input=document.querySelector('[aria-label="Message AI"]');globalThis.draftObserver=new MutationObserver(()=>{const copy=input.cloneNode(true);copy.querySelectorAll('.cm-placeholder').forEach(node=>node.remove());const value=copy.textContent??'';if(value.trim())stableDrafts.push(value);});draftObserver.observe(input,{subtree:true,characterData:true,childList:true});
 });
 this.case.text=await capture(page,75);assert.equal(norm(this.case.text),expected(5));
 this.case.long=await page.evaluate(async()=>{
  draftObserver.disconnect();for(let i=1;i<stableDrafts.length;i++)if(!stableDrafts[i].startsWith(stableDrafts[i-1]))throw Error('Confirmed draft was rewritten');
  const api=modelLive.speech.continuous,result=api.getResult(),snapshot=api.snapshot();
  const chunks=[];for(const item of result.segments){const record=await api.getSegment(item.sessionId);chunks.push(record.pcm.subarray(record.coreStartSample-record.audioStartSample,record.endSample-record.audioStartSample));}
  const hash=async parts=>{const pcm=new Float32Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){pcm.set(p,offset);offset+=p.length;}return[...new Uint8Array(await crypto.subtle.digest('SHA-256',pcm.buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');};
  const archive=await hash(chunks),capture=await hash(capturedSpeech);if(archive!==capture)throw Error('Archived core PCM differs from the real AudioWorklet');
  return{result,snapshot,archive,capture,stableUpdates:stableDrafts.length};
 });
 assert.equal(this.case.long.result.completedSegments,4);assert.ok(this.case.long.stableUpdates>1);assert.ok(this.case.long.result.session.peakFeatureOwners<=2);
 const source=await readFile(process.env.MODEL_LIVE_SOURCE_AUDIO);
 this.case.backlog=await page.evaluate(async b64=>{
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),audio=await new OfflineAudioContext(1,16000,16000).decodeAudioData(bytes.buffer),cycle=new Float32Array(15*16000);
  for(let c=0;c<audio.numberOfChannels;c++){const channel=audio.getChannelData(c);for(let i=0;i<channel.length;i++)cycle[32000+i]+=channel[i]/audio.numberOfChannels;}
  const service=modelLive.speech,api=service.continuous,originalStart=api.startRecord,originalStop=api.stopRecord;let text='';api.startRecord=api.startInjected;api.stopRecord=api.finishInjected;
  try{
   await service.record('accelerated-queue',part=>text+=(text?' ':'')+part);let sent=0,index=0,peakQueue=0;const began=performance.now(),packets=[4000,173,7021,1600,999];
   while(sent<600*16000){const count=Math.min(packets[index++%packets.length],600*16000-sent,cycle.length-sent%cycle.length);await api.pushPcm(cycle.slice(sent%cycle.length,sent%cycle.length+count));sent+=count;peakQueue=Math.max(peakQueue,api.snapshot().session.queuedSegments);if(index%4===0)await new Promise(resolve=>setTimeout(resolve,0));}
   await service.stop('accelerated-queue');if(service.state.error)throw Error(service.state.error);return{text,peakQueue,result:api.getResult(),wallMs:performance.now()-began};
  }finally{api.startRecord=originalStart;api.stopRecord=originalStop;}
 },source.toString('base64'));
 assert.equal(norm(this.case.backlog.text),expected(40));assert.equal(this.case.backlog.result.totalSamples,600*16000);assert.equal(this.case.backlog.result.completedSegments,30);assert.ok(this.case.backlog.peakQueue>0);
 await page.evaluate(async b64=>{
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)),audio=await new OfflineAudioContext(1,16000,16000).decodeAudioData(bytes.buffer),api=modelLive.speech.continuous,start=api.startRecord;api.startRecord=api.startInjected;
  try{await modelLive.speech.record('cancel-probe',()=>{});}finally{api.startRecord=start;}
  globalThis.cancelledSpeechApi=api;await api.pushPcm(audio.getChannelData(0).slice(0,5*16000));
 },source.toString('base64'));
 await expect.poll(()=>page.evaluate(async()=>{const api=modelLive.speech.continuous;return api.getEvents().some(event=>event.type==='inferenceStart'&&event.segmentId===api.snapshot().session?.activeId)&&(await api.stats()).in_flight;}),{timeout:10000,intervals:[20,50]}).toBe(true);
 await page.evaluate(()=>modelLive.speech.unload());this.case.cancelled=await page.evaluate(()=>cancelledSpeechApi.snapshot());assert.equal(this.case.cancelled.workerAlive,false);assert.equal(this.case.cancelled.session.featureOwners,0);
 await page.evaluate(()=>modelLive.speech.initialize());await ready(page);
 this.case.silence=await page.evaluate(async()=>{
  const service=modelLive.speech,api=service.continuous,start=api.startRecord,stop=api.stopRecord;let text='';api.startRecord=api.startInjected;api.stopRecord=api.finishInjected;
  try{await service.record('silence-probe',part=>text+=part);await api.pushPcm(new Float32Array(16000));await service.stop('silence-probe');return{text,result:api.getResult(),inferences:api.getEvents().filter(event=>event.type==='inferenceStart').length};}finally{api.startRecord=start;api.stopRecord=stop;}
 });assert.equal(this.case.silence.text,'');assert.equal(this.case.silence.inferences,0);
 const archiveProof=()=>page.evaluate(async()=>{
  const api=modelLive.speech.continuous,rows=await api.listSegments(),proof=[];
  for(const row of rows){const record=await api.getSegment(row.sessionId);const bytes=new Uint8Array(record.pcm.buffer,record.pcm.byteOffset,record.pcm.byteLength),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');proof.push({id:row.sessionId,samples:record.pcm.length,sha256});}
  return proof;
 });const audioBefore=await archiveProof();
 const archiveBefore=await page.evaluate(()=>modelLive.speech.continuous.listSegments());
 await page.evaluate(async()=>{const api=modelLive.speech.continuous,unload=api.unload.bind(api);api.unload=async()=>globalThis.lastSpeechResources=await unload();await modelLive.speech.unload();});
 this.case.unload=await page.evaluate(()=>lastSpeechResources);assert.equal(this.case.unload.api_live_gpu_buffers,0);assert.deepEqual(this.case.unload.gpu_errors,[]);
 await context.setOffline(true);try{await page.evaluate(()=>modelLive.speech.initialize());await ready(page);this.case.offline=true;}finally{await context.setOffline(false);}
 await page.evaluate(()=>modelLive.speech.unload());await page.reload({waitUntil:'networkidle'});
 await page.evaluate(async imports=>{const [{BrowserAgentHarness},catalog,selection]=await Promise.all([import('/lib/assistant/harness.ts'),import('/lib/assistant/browser/catalog.ts'),import('/lib/assistant/browser/selection.ts')]);globalThis.modelLive={runtime:await import(imports.runtime),BrowserAgentHarness,...catalog,...selection,...await import(imports.speech)};},imports);
 const archiveAfter=await page.evaluate(async()=>{const{speechRecordings}=await import('/lib/assistant/speech/recordings.ts');return speechRecordings();});assert.deepEqual(archiveAfter,archiveBefore);
 // Reading archives does not need model loading or a live capture worker.
 const audioAfter=await page.evaluate(async()=>{
  const{createSegmentStore}=await import('/lib/assistant/speech/runtime/continuous/segment-store.js'),store=createSegmentStore({name:'code-speech-segments-v1'}),proof=[];
  try{for(const row of await store.list()){const record=await store.get(row.sessionId),bytes=new Uint8Array(record.pcm.buffer,record.pcm.byteOffset,record.pcm.byteLength);proof.push({id:row.sessionId,samples:record.pcm.length,sha256:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('')});}}finally{await store.close();}return proof;
 });assert.deepEqual(audioAfter,audioBefore);this.case.archiveSegments=archiveAfter.length;this.case.archiveProof=audioAfter;
});
Then('continuous editor dictation with {string} uses GPU detection and finalizes the fixture',async function(vad){
 const{page}=await speechSetup();await page.getByRole('button',{name:'New chat',exact:true}).click();
 await page.evaluate(async vad=>{await modelLive.speech.setVad(vad);await modelLive.speech.prepare('gpu-nq',new AbortController().signal);},vad);await ready(page);
 this.case.runtime=await page.evaluate(()=>modelLive.speech.state.runtime);assert.equal(this.case.runtime.vad.selected_backend,'WebGPU');assert.equal(this.case.runtime.vad.cpu_model_fallback,false);
 this.case.text=await capture(page,15);this.case.vad=vad;assert.equal(norm(this.case.text),gold);
 this.case.resources=await page.evaluate(async()=>{const api=modelLive.speech.continuous;return{snapshot:api.snapshot(),stats:await api.stats()};});assert.deepEqual(this.case.resources.stats.gpu_errors,[]);
 const calls=this.case.resources.stats.vad.model_calls??this.case.resources.stats.vad.counters?.model_calls;assert.ok(calls>0,'The selected GPU detector must execute real model calls.');
 this.case.unload=await page.evaluate(async()=>{const api=modelLive.speech.continuous,unload=api.unload.bind(api);let resources;api.unload=async()=>resources=await unload();await modelLive.speech.unload();return resources;});assert.equal(this.case.unload.api_live_gpu_buffers,0);assert.equal(this.case.unload.api_live_gpu_buffer_bytes,0);
});
