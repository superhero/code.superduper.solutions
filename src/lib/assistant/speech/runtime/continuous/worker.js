// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01; continuous-sources.json preserves source provenance.
import {createNqSpeech} from '../nq/nr/engine.js';
import {LiveDecoder} from '../live-decoder.js';
import {LiveFeatures} from '../live-features.js';
import {createSpeechVad} from '../vad.js';
import {createComputeQueue} from '../compute-queue.js';

let engine,vad,live,features,streamId,generation=0,endingReason=null,frames=[];
let messages=Promise.resolve();
let runtimeBroken=false;
const compute=createComputeQueue({fatal:true,onFatal:error=>{runtimeBroken=true;generation++;if(live)live.ended=true;features?.close();send('error',{sessionId:streamId,message:error.message||String(error),stack:error.stack});}});
const resources=()=>({...engine?.stats(),vad:vad?.info?structuredClone(vad.info):null});
const send=(type,data={})=>postMessage({type,...data});
self.onmessage=({data})=>{
 messages=messages.then(()=>handle(data)).catch(error=>send('error',{requestId:data.requestId,sessionId:data.sessionId,message:error.message||String(error),stack:error.stack}));
};
async function handle(data){
 if(runtimeBroken){if(data.type==='unload')send('unloaded',{requestId:data.requestId,resources:{invalidated:true}});return;}
 if(data.type==='load'){
  if(engine)throw Error('Unload the previous speech worker first');
  engine=await createNqSpeech({assets:data.assets,ortPaths:data.ortPaths,stage:text=>send('stage',{text})});
  vad=await createSpeechVad(data.vad,data.vadAssets,engine.device);await engine.transcribe(new Float32Array(16000),16000,{returnTimestamps:true});
  send('ready',{requestId:data.requestId,runtime:{...engine.runtime,coreSegmentSeconds:20,overlapSeconds:2,modelContextSeconds:30,vad:vad.info},resources:engine.stats()});
 }else if(data.type==='streamStart'){
  if(!engine)throw Error('Load the ASR model first');
  if(live&&!live.ended)throw Error('Previous recognition segment must finish before the next starts');
  const epoch=++generation;streamId=data.sessionId;endingReason=null;
  await compute(async()=>{engine.reset();await vad.reset();});features?.close();
  const segmentFeatures=features=new LiveFeatures(128,data.featurePort);
  const current=id=>epoch===generation&&id===streamId;
  live=new LiveDecoder({maxContextSeconds:30,detect:()=>frames,
   infer:async(pcm,timeOffset)=>{
    const start=Math.round(timeOffset*16000),prepared=await segmentFeatures.compute(start,start+pcm.length);
    send('inferenceStart',{sessionId:data.sessionId,start,end:start+pcm.length,featureFrames:prepared.T});
    return compute(()=>{if(!current(data.sessionId))throw Error('Stale speech inference was cancelled');return engine.transcribe(pcm,16000,{returnTimestamps:true,timeOffset,precomputedFeatures:prepared});});
   },
   update:result=>{
    if(!current(data.sessionId))return;
    const snapshot=live.merger.snapshot();
    send('partial',{sessionId:data.sessionId,...result,words:[...snapshot.stable,...snapshot.draft],naturalPause:!!result.paused&&!endingReason});
   },
   finish:async result=>{
    segmentFeatures.close();
    if(current(data.sessionId))send('result',{sessionId:data.sessionId,...result,endReason:endingReason,resources:resources()});
   },
   error:error=>{
    segmentFeatures.close();
    if(current(data.sessionId))send('error',{sessionId:data.sessionId,message:error.message||String(error),stack:error.stack});
   }
  });
  send('streamStarted',{requestId:data.requestId,sessionId:data.sessionId});
 }else if(data.type==='streamChunk'){
  if(data.sessionId===streamId){
   // Durable backlog may arrive as a full segment. Native VAD frontends retain
   // their verified 250 ms packet contract while every PCM sample reaches ASR.
   for(let start=0;start<data.pcm.length;start+=4000){const pcm=data.pcm.subarray(start,start+4000);frames=await compute(()=>vad.process(pcm));live?.push(pcm);}
  }
 }else if(data.type==='streamEnd'){
  if(data.sessionId===streamId){endingReason=data.reason||'rotation';live?.activity.observe(await compute(()=>vad.flush?.())||[]);live?.end(data.pcm);}
 }else if(data.type==='stats')send('stats',{requestId:data.requestId,resources:engine?resources():{unloaded:true}});
 else if(data.type==='unload'){
  generation++;if(live)live.ended=true;features?.close();features=null;
  const resources=await compute(async()=>{await vad?.close();vad=null;return engine?.dispose();});engine=null;live=null;send('unloaded',{requestId:data.requestId,resources});
 }
}
