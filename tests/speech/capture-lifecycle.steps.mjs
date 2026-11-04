// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted lifecycle cases from the verified reference; real model checks remain separate.
import {Given,When,Then} from 'quickpickle';
import {afterEach,expect,vi} from 'vitest';
import {createLongSpeech} from '../../src/lib/assistant/speech/runtime/continuous/capture.js';

const RATE=16000;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return{promise,resolve,reject};};
// Deferred resource gates determine ordering; microtasks only settle RPC replies.
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
let h;
function fixture(){
  const workers=[],contexts=[],records=new Map(),events=[],closeGate=deferred(),closeStarted=deferred(),failed=deferred();
  let rejectWrites=false;
  const store={
    async put(record){if(rejectWrites)throw Object.assign(Error('Speech storage quota exceeded'),{name:'QuotaExceededError'});records.set(record.sessionId,structuredClone(record));},
    async get(id){return structuredClone(records.get(id));},
    async list(recordingId){return [...records.values()].filter(row=>!recordingId||row.recordingId===recordingId).map(({pcm,...row})=>structuredClone(row));},
    async update(id,patch){Object.assign(records.get(id),patch);}
  };
  class Worker {
    constructor(url){this.terminated=0;this.messages=[];if(url==='blob:inference')workers.push(this);}
    emit(data){this.onmessage?.({data});}
    postMessage(data){
      this.messages.push(data);data.port?.close();data.featurePort?.close();
      const types={load:'ready',unload:'unloaded',streamStart:'streamStarted',stats:'stats'};
      if(types[data.type])queueMicrotask(()=>{if(!this.terminated)this.emit({type:types[data.type],requestId:data.requestId,sessionId:data.sessionId,runtime:{profile:'fixture'},resources:{fixture:true}});});
    }
    terminate(){this.terminated++;}
  }
  vi.stubGlobal('Worker',Worker);
  vi.stubGlobal('navigator',{mediaDevices:{async getUserMedia(){
    const track={readyState:'live',stop:vi.fn(function(){this.readyState='ended';}),getSettings:()=>({sampleRate:RATE})};
    return{getTracks:()=>[track],getAudioTracks:()=>[track]};
  }}});
  vi.stubGlobal('AudioContext',class{
    constructor(){this.sampleRate=RATE;this.audioWorklet={addModule:async()=>{}};this.destination={};
      this.close=vi.fn(()=>{closeStarted.resolve();return closeGate.promise;});contexts.push(this);}
    async resume(){}
    createMediaStreamSource(){return{connect(){},disconnect(){}};}
  });
  vi.stubGlobal('AudioWorkletNode',class{
    constructor(){this.port={postMessage:()=>queueMicrotask(()=>this.port.onmessage?.({data:{type:'flushed'}}))};}
    connect(){} disconnect(){}
  });
  const api=createLongSpeech({config:{assets:{},ortPaths:'fixture',workerURL:'blob:inference',featuresURL:'blob:features'},createStore:()=>store,onEvent:event=>events.push(event),
    onState:state=>{if(state.lastError&&!state.workerAlive)failed.resolve(state);}});
  return{api,workers,contexts,records,events,closeGate,closeStarted,failed,rejectWrites:value=>{rejectWrites=value;}};
}
afterEach(async()=>{
  h?.closeGate.resolve();
  await h?.reloading?.catch(()=>{});
  await h?.cancelling?.catch(()=>{});
  await h?.repeated?.catch(()=>{});
  await h?.api.unload().catch(()=>{});
  vi.unstubAllGlobals();h=undefined;
});
Given('a loaded speech controller with a gated microphone close',async()=>{
  h=fixture();await h.api.load();await h.api.startRecord({recordingId:'microphone-first'});
  await h.api.pushPcm(new Float32Array(RATE));await settle();
});
When('I cancel twice and reload before microphone cleanup finishes',async()=>{
  h.cancelling=h.api.cancel();await h.closeStarted.promise;
  h.repeated=h.api.cancel();h.reloading=h.api.load();await settle();
  h.blockedWorkers=h.workers.length;h.sharedCancellation=h.cancelling===h.repeated;
  h.closeGate.resolve();await Promise.all([h.cancelling,h.repeated,h.reloading]);
});
Then('one teardown completes before a usable replacement worker loads',()=>{
  expect(h.sharedCancellation).toBe(true);expect(h.blockedWorkers).toBe(1);
  expect(h.contexts[0].close).toHaveBeenCalledTimes(1);
  expect(h.workers).toHaveLength(2);expect(h.workers[0].terminated).toBe(1);expect(h.workers[1].terminated).toBe(0);
  expect(h.api.snapshot()).toMatchObject({ready:true,workerAlive:true,pendingRequests:0,audioContexts:0,lastError:null});
});
When('a segment fails and I reload before microphone cleanup finishes',async()=>{
  h.workers[0].emit({type:'error',sessionId:h.api.snapshot().session.activeId,message:'Fixture segment failed'});
  await h.closeStarted.promise;h.reloading=h.api.load();await settle();h.blockedWorkers=h.workers.length;
  h.closeGate.resolve();await h.reloading;await settle();
});
Then('the failure is reported once and replacement resources survive',()=>{
  expect(h.events.filter(event=>event.type==='failure')).toHaveLength(1);expect(h.blockedWorkers).toBe(1);
  expect(h.contexts[0].close).toHaveBeenCalledTimes(1);expect(h.workers[0].terminated).toBe(1);expect(h.workers[1].terminated).toBe(0);
  expect(h.api.snapshot()).toMatchObject({ready:true,workerAlive:true,pendingRequests:0,lastError:null});
});
Given('a loaded speech controller whose archive rejects writes',async()=>{
  h=fixture();h.closeGate.resolve();await h.api.load();h.rejectWrites(true);await h.api.startInjected({recordingId:'unarchived-first'});
});
When('a captured core cannot be archived and I start another recording',async()=>{
  h.original=Float32Array.from({length:20*RATE},(_,i)=>i/RATE);
  await expect(h.api.pushPcm(h.original)).rejects.toThrow('quota');await h.failed.promise;
  h.before=h.api.getRecoveryAudio();h.rejectWrites(false);await h.api.load();await h.api.startInjected({recordingId:'replacement'});
});
Then('the earlier PCM remains recoverable until explicitly discarded',()=>{
  expect(h.before).toHaveLength(1);
  const retained=h.api.getRecoveryAudio();expect(retained).toHaveLength(1);expect(retained[0].recordingId).toBe('unarchived-first');
  expect(retained[0].pcm).toEqual(h.original);retained[0].pcm[0]=123;
  expect(h.api.getRecoveryAudio()[0].pcm[0]).toBe(h.original[0]);
  expect(()=>h.api.discardRecoveryAudio()).toThrow();expect(()=>h.api.discardRecoveryAudio('missing')).toThrow();
  expect(h.api.discardRecoveryAudio('unarchived-first')).toBe(1);expect(h.api.getRecoveryAudio()).toEqual([]);
});
