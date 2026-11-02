// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from 'quickpickle';
import {expect,vi} from 'vitest';
import {SpeechController} from '../../src/lib/assistant/speech/controller';
import {createLongSpeech} from '../../src/lib/assistant/speech/runtime/continuous/capture.js';
import {vadModes,vadArtifacts} from '../../src/lib/assistant/speech/vad';
import {createComputeQueue} from '../../src/lib/assistant/speech/runtime/compute-queue.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
Then('fatal speech compute errors fence queued native calls until a fresh worker',async()=>{
 const onFatal=vi.fn(),compute=createComputeQueue({fatal:true,onFatal});let entered=0;
 const failed=compute(()=>{throw new WebAssembly.RuntimeError('memory access out of bounds');});
 const queued=compute(()=>{entered++;});await expect(failed).rejects.toThrow('out of bounds');await expect(queued).rejects.toThrow('fresh worker');
 await expect(compute(()=>{entered++;})).rejects.toThrow('fresh worker');expect(entered).toBe(0);expect(onFatal).toHaveBeenCalledOnce();
 await expect(createComputeQueue({fatal:true})(()=>123)).resolves.toBe(123);
});
Then('detector and recognition operations share one serial compute queue',async()=>{
 const compute=createComputeQueue(),gate=deferred(),events=[];let active=0,peak=0;
 const operation=(name,wait=Promise.resolve())=>compute(async()=>{active++;peak=Math.max(peak,active);events.push(name+':start');await wait;events.push(name+':end');active--;});
 const detection=operation('vad',gate.promise),recognition=operation('asr'),next=operation('vad-next');await tick();expect(events).toEqual(['vad:start']);gate.resolve();await Promise.all([detection,recognition,next]);
 expect(peak).toBe(1);expect(events).toEqual(['vad:start','vad:end','asr:start','asr:end','vad-next:start','vad-next:end']);
 await expect(compute(()=>Promise.reject(Error('failed operation')))).rejects.toThrow('failed operation');await expect(compute(()=>42)).resolves.toBe(42);
});
function harness(){
 const instances=[],draft=[];
 const controller=new SpeechController({cachedSpeechURLs:async()=>({urls:{worker:'blob:owned',...Object.fromEntries(['encoder-model.onnx','encoder-model.onnx.data','decoder-single-step.int8-fp32.onnx','vocab.txt','ort-mjs','ort-wasm','ten-js','ten-wasm'].map(id=>[id,'blob:'+id]))},close:vi.fn()}),
  installedSpeech:async()=>['gpu-nq'],installSpeech:vi.fn(),removeSpeech:vi.fn(),createWorker:vi.fn(),createCapture:vi.fn(),
  createContinuous(options){const api={options,finalized:deferred(),load:async()=>({runtime:{decoder:'gpu'}}),startRecord:async({recordingId})=>{api.id=recordingId;options.onEvent({type:'captureStarted'});},stopRecord:()=>api.finalized.promise,getTranscript:()=>draft.join(' '),unload:vi.fn(async()=>{}),getRecoveryAudio:()=>[]};instances.push(api);return api;}});
 return{controller,instances,draft,commit:text=>draft.push(text),emit(api,sequence,text,draftText='',final=false){api.options.onTranscript({recordingId:api.id,stableDelta:{sequence,text,words:[]},draftText,final});if(final)api.finalized.resolve();}};
}
Then('continuous speech appends each sequence once and replaces only provisional text',async()=>{
 const h=harness();await h.controller.initialize();await h.controller.record('draft-1',h.commit);const api=h.instances[0];
 h.emit(api,1,'Hello','wor');h.emit(api,1,'Hello','world');expect(h.controller.state.transcript).toBe('world');
 h.emit(api,2,' world.','');const stopping=h.controller.stop('draft-1');h.emit(api,2,'','',true);await stopping;expect(h.draft).toEqual(['Hello','world.']);expect(h.controller.state.phase).toBe('ready');expect(h.controller.owner).toBeUndefined();await h.controller.unload();
});
Then('language loading waits for continuous speech to finish and unload',async()=>{
 const h=harness();await h.controller.initialize();await h.controller.record('draft-1',h.commit);const api=h.instances[0],release=deferred();api.unload=()=>release.promise;
 let done=false;const switching=h.controller.releaseForLanguage(new AbortController().signal).then(()=>done=true);await tick();expect(done).toBe(false);
 const stopping=h.controller.stop('draft-1');h.emit(api,1,'Final words.','',true);await stopping;await tick();expect(done).toBe(false);release.resolve();await switching;expect(done).toBe(true);expect(h.controller.state.phase).toBe('idle');
});
Then('cancelled continuous callbacks cannot write to a later conversation',async()=>{
 const h=harness();await h.controller.initialize();await h.controller.record('old',h.commit);const old=h.instances[0];await h.controller.unload();
 await h.controller.initialize();await h.controller.record('new',h.commit);h.emit(old,1,'Wrong words.','wrong');old.options.onState({lastError:'late failure'});
 h.emit(h.instances[1],1,'Current words.','',true);expect(h.draft).toEqual(['Current words.']);expect(h.controller.state.error).toBe('');await h.controller.unload();
});
Then('a late continuous permission failure preserves a freshly loaded worker',async()=>{
 const permission=deferred(),workers=[];const prior=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>permission.promise}}});
 try{
  const speech=createLongSpeech({config:{workerURL:'blob:worker'},createStore:()=>({list:async()=>[]}),createWorker:()=>{
   const worker={onmessage:null,terminate:vi.fn(),postMessage(data){queueMicrotask(()=>worker.onmessage?.({data:{type:data.type==='load'?'ready':'unloaded',requestId:data.requestId,runtime:{},resources:{}}}));}};workers.push(worker);return worker;}});
  await speech.load();const recording=speech.startRecord().catch(error=>error);await tick();await speech.cancel();await speech.load();
  permission.reject(Error('delayed permission denial'));expect((await recording).message).toContain('denial');expect(speech.snapshot().ready).toBe(true);expect(workers[1].terminate).not.toHaveBeenCalled();await speech.unload();
 }finally{if(prior)Object.defineProperty(globalThis,'navigator',prior);else delete globalThis.navigator;}
});
Then('continuous speech offers only verified VAD models with explicit placement and delay',()=>{
 expect(vadModes.map(item=>item.id)).toEqual(['ten','firered','fsmn','marblenet']);
 expect(vadModes.find(item=>item.id==='marblenet').detail).toContain('1.45');expect(vadModes.find(item=>item.id==='fsmn').detail).toContain('endpoint/SNR');
 for(const mode of ['firered','fsmn','marblenet']){const files=vadArtifacts(mode);expect(files.some(file=>file.id.endsWith('.onnx'))).toBe(true);expect(files.every(file=>/^[a-f0-9]{64}$/.test(file.sha256)&&!file.url.includes('192.168.'))).toBe(true);}
});
