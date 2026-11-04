// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from llm-sds-01; continuous-sources.json preserves source provenance.
import {LiveFeatures} from '../live-features.js';
import {SegmentSession} from './segment-session.js';
import {createSegmentStore} from './segment-store.js';
import {createTranscriptMerger} from './transcript-merger.js';

const RATE=16000;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return{promise,resolve,reject};};
const joinText=(a,b)=>[a,b].filter(Boolean).join(' ').replace(/\s+([,.!?;:])/g,'$1').trim();
export function createLongSpeech({config,onState=()=>{},onTranscript=()=>{},onEvent=()=>{},createWorker=url=>new Worker(url,{type:'module'}),createStore=createSegmentStore}){
 let worker,epoch=0,requestId=0,current,lastSession,store,ready=false,loading=false,lastResult=null,lastError=null,cleanup,loadJob;
 const pending=new Map(),endTimers=new Map(),contexts=new Set(),tracks=new Set();
 const terminatedWorkers=new WeakSet(),recoverySources=new Set(),discardedRecovery=new WeakSet();
 const events=[];
 const getStore=()=>{store ||= createStore({name:'code-speech-segments-v1'});return store;};
 const event=(type,data={})=>{const item={type,at:performance.now(),...data};events.push(item);if(events.length>500)events.shift();onEvent(item);};
 const snapshot=()=>({ready,loading,recording:!!current?.accepting,finishing:!!current?.stopping,recordingId:current?.id||lastResult?.recordingId||lastSession?.id||null,workerAlive:!!worker,pendingRequests:pending.size,audioContexts:contexts.size,liveTracks:[...tracks].filter(t=>t.readyState==='live').length,lastError,session:current?.coordinator?.snapshot()||lastSession?.coordinator?.snapshot()||null,transcript:current?.merger.getState()||lastSession?.merger.getState()||null,partialCount:current?.partialCount||lastSession?.partialCount||0,completed:lastResult?.completedSegments||0});
 const emit=()=>onState(snapshot());
 function terminate(reason,target){
  if(!target)return;
  if(!terminatedWorkers.has(target)){terminatedWorkers.add(target);target.terminate();}
  if(worker!==target)return;
  epoch++;worker=null;ready=false;loading=false;
  for(const [id,item]of pending){if(item.worker!==target)continue;clearTimeout(item.timer);item.reject(Error(reason));pending.delete(id);}
  for(const timer of endTimers.values())clearTimeout(timer);endTimers.clear();
 }
 function rpc(data,transfer=[],timeout=120000){
  if(!worker)return Promise.reject(Error('Load the speech model first'));
  const id=++requestId,target=worker;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error(data.type+' timed out'));},timeout);
   pending.set(id,{resolve,reject,timer,worker:target});
   try{target.postMessage({...data,requestId:id},transfer);}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
 }
 function closeMic(session){
  if(!session)return Promise.resolve();
  if(session.micClosing)return session.micClosing;
  const context=session.context;session.context=null;
  session.micClosing=(async()=>{
   session.source?.disconnect();session.node?.disconnect();
   for(const track of session.stream?.getTracks()||[]){track.stop();tracks.delete(track);}
   if(context){await context.close().catch(()=>{});contexts.delete(context);}
  })();return session.micClosing;
 }
 function drainProgress(session){
  clearTimeout(session.drainTimer);
  if(session.stopping&&current===session)session.drainTimer=setTimeout(()=>fail(Error('Queued recognition made no progress for180seconds; recorded segments remain available')),180000);
 }
 function teardown(reason,{failure,graceful=false}={}){
  if(cleanup)return cleanup.promise;
  const session=current,target=worker,done=deferred(),entry={session,worker:target,promise:done.promise,settled:false};cleanup=entry;
  current=null;ready=false;loading=false;
  if(failure){lastError=failure.message||String(failure);event('failure',{message:lastError});}
  clearTimeout(session?.drainTimer);session?.flush?.reject(failure||Error(reason));
  if(session)recoverySources.add(session.coordinator);
  const cancelled=session?.coordinator.cancel();cancelled?.catch(()=>{});
  if(!graceful||session)terminate(reason,target);
  (async()=>{
   let resources,problem;
   try{
    if(graceful&&!session&&target)resources=(await rpc({type:'unload'})).resources;
   }catch(error){problem=error;}
   const outcomes=await Promise.allSettled([closeMic(session),cancelled]);
   for(const outcome of outcomes)if(outcome.status==='rejected')lastError=outcome.reason.message||String(outcome.reason);
   terminate(reason,target);
   entry.settled=true;
   if(session&&!session.coordinator.retainedAudio().length)recoverySources.delete(session.coordinator);
   event(session?'cancelled':'unloaded',{recordingId:session?.id,...(!session?{resources}:{})});emit();
   if(problem)throw problem;
   return session?snapshot():resources;
  })().then(done.resolve,done.reject);return entry.promise;
 }
 const fail=error=>teardown(error.message||String(error),{failure:error});
 const transcriptText=session=>joinText(session.fragments.join(''),session.draftText);
 function acceptTranscript(session,data){
  if(current!==session)return;
  const segment=data.segment;
  let delta;try{delta=session.merger.update({segmentId:segment.sessionId,audioStartSample:segment.audioStartSample,
    decodedThroughSeconds:data.decodedThroughSeconds??data.seconds??((segment.endSample-segment.audioStartSample)/RATE),
    reason:data.type==='result'?segment.reason:'partial',naturalPause:!!data.naturalPause,words:data.words||[]});}
  catch(error){fail(error);return;}
  drainProgress(session);
  if(delta.stableDelta.text)session.fragments.push(delta.stableDelta.text);
  session.draftText=delta.draftText;session.partialCount++;
  if(!session.firstPartialAt&&(delta.draftText||delta.stableDelta.text))session.firstPartialAt=performance.now();
  onTranscript({...delta,segment,recordingId:session.id,final:false});
  event(data.type==='result'?'segmentFinal':'partial',{segmentId:segment.sessionId,segmentIndex:segment.index,
    capturedSamples:session.coordinator.snapshot().capturedSamples,stableSequence:delta.stableDelta.sequence,
    stableWordsAdded:delta.stableDelta.words.length,draftWords:delta.draftText?delta.draftText.split(/\s+/).length:0,
    ...(data.type==='result'?{resources:data.resources}:{}),featureOwners:session.coordinator.snapshot().featureOwners});
  emit();
 }
 function spawn(){
  const activeEpoch=epoch,target=worker=createWorker(config.workerURL);
  target.onmessage=({data})=>{
   if(activeEpoch!==epoch||worker!==target)return;
   if(data.type==='result'||data.type==='error'){clearTimeout(endTimers.get(data.sessionId));endTimers.delete(data.sessionId);}
   const request=pending.get(data.requestId);
   if(request){pending.delete(data.requestId);clearTimeout(request.timer);data.type==='error'?request.reject(Error(data.message)):request.resolve(data);}
   if(['partial','result','error'].includes(data.type)&&data.sessionId)current?.coordinator.onMessage(data);
   else if(data.type==='error'&&!request)fail(Error(data.message));
   if(data.type==='stage')event('stage',{text:data.text});
   if(data.type==='inferenceStart')event('inferenceStart',{segmentId:data.sessionId,start:data.start,end:data.end});
  };
  target.onerror=error=>{if(activeEpoch===epoch&&worker===target)fail(Error(error.message||'Speech worker failed'));};
  target.onmessageerror=()=>{if(activeEpoch===epoch&&worker===target)fail(Error('Speech worker returned unreadable data'));};
 }
 function load(){
  if(loadJob&&(!cleanup||loadJob.cleanup===cleanup))return loadJob.promise;
  const job={cleanup,promise:null};loadJob=job;
  job.promise=(async()=>{
   await cleanup?.promise.catch(()=>{});
   if(worker)await unload();
   cleanup=null;lastError=null;loading=true;emit();spawn();const target=worker,activeEpoch=epoch;
   try{
    const result=await rpc({type:'load',assets:config.assets,ortPaths:config.ortPaths,vad:config.vad,vadAssets:config.vadAssets},[],120000);
    if(worker!==target||epoch!==activeEpoch)throw Error('Speech loading cancelled');
    ready=true;loading=false;event('modelReady',{runtime:result.runtime,resources:result.resources});emit();return result;
   }catch(error){if(worker===target&&epoch===activeEpoch)await fail(error);throw error;}
  })().finally(()=>{if(loadJob===job)loadJob=null;});return job.promise;
 }
 async function begin({recordingId=crypto.randomUUID(),segmentSeconds=config.segmentSeconds||20,overlapSeconds=config.overlapSeconds||2,injected=false}={}){
  if(!ready||!worker)throw Error('Load the speech model first');if(current)throw Error('Finish or cancel the current recording first');
  const target=worker,activeEpoch=epoch;store=getStore();await store.list(recordingId);
  if(worker!==target||epoch!==activeEpoch||!ready)throw Error('Recording cancelled');
  if(current)throw Error('Finish or cancel the current recording first');
  const session={id:recordingId,fragments:[],draftText:'',merger:createTranscriptMerger({overlapSeconds}),partialCount:0,startedAt:performance.now(),injected,accepting:true};
  const transport={
   start:({sessionId,featurePort})=>rpc({type:'streamStart',sessionId,featurePort},[featurePort],30000),
   chunk:({sessionId,pcm})=>{if(!worker)throw Error('Speech worker is unavailable');worker.postMessage({type:'streamChunk',sessionId,pcm},[pcm.buffer]);},
   end:({sessionId,pcm,reason})=>{if(!worker)throw Error('Speech worker is unavailable');endTimers.set(sessionId,setTimeout(()=>{if(current===session)fail(Error('Recognition segment stalled for180seconds'));},180000));worker.postMessage({type:'streamEnd',sessionId,pcm,reason},[pcm.buffer]);}
  };
  session.coordinator=new SegmentSession({transport,featuresFactory:()=>new LiveFeatures(128,null,createWorker(config.featuresURL)),store,recordingId,
   segmentSeconds,overlapSeconds,onTranscript:data=>acceptTranscript(session,data),
   onProgress:progress=>{if(current!==session)return;event('queue',{...progress});emit();},onError:error=>{if(current===session)fail(error);}});
  current=lastSession=session;lastResult=null;lastError=null;emit();return session;
 }
 function pushPcm(pcm){
  if(!current?.accepting)throw Error('No active capture session');
  const session=current,work=session.coordinator.push(pcm);Promise.resolve(work).catch(error=>{if(current===session)fail(error);});return work;
 }
 async function startRecord(options={}){
  const session=await begin(options);
  try{
   session.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:RATE,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   if(current!==session){session.stream.getTracks().forEach(t=>t.stop());throw Error('Recording cancelled');}
   for(const track of session.stream.getTracks())tracks.add(track);
   session.context=new AudioContext({sampleRate:RATE});contexts.add(session.context);
   if(session.context.sampleRate!==RATE)throw Error('This device cannot capture16kHz audio');
   await session.context.audioWorklet.addModule(config.captureURL);await session.context.resume();
   if(current!==session)throw Error('Recording cancelled');
   session.node=new AudioWorkletNode(session.context,'pcm-capture');session.source=session.context.createMediaStreamSource(session.stream);
   session.node.port.onmessage=({data})=>{if(current!==session)return;if(data.type==='flushed'){session.flush?.resolve();return;}if(data.type==='pcm'){try{pushPcm(data.pcm);}catch(error){fail(error);}}};
   session.source.connect(session.node);session.node.connect(session.context.destination);
   event('captureStarted',{recordingId:session.id,rate:RATE,trackSettings:session.stream.getAudioTracks()[0].getSettings()});emit();return{recordingId:session.id};
  }catch(error){if(current===session)await fail(error);else await closeMic(session);throw error;}
 }
 async function finish(session){
  if(session.finishPromise)return session.finishPromise;
  session.finishPromise=(async()=>{
   try{
    drainProgress(session);const result=await session.coordinator.stop();clearTimeout(session.drainTimer);
    if(current!==session)throw Error('Recording cancelled');
    const delta=session.merger.finish();if(delta.stableDelta.text)session.fragments.push(delta.stableDelta.text);session.draftText=delta.draftText;
    const text=transcriptText(session);onTranscript({...delta,recordingId:session.id,final:true});
    const archived=await store.list();const segments=archived.filter(item=>item.recordingId===session.id||String(item.id||item.sessionId).startsWith(session.id));
    if(current!==session)throw Error('Recording cancelled');
    const resources=worker?(await rpc({type:'stats'})).resources:null;
    if(current!==session)throw Error('Recording cancelled');
    lastResult={...result,recordingId:session.id,text,seconds:result.totalSamples/RATE,partialCount:session.partialCount,
     firstPartialMs:session.firstPartialAt?session.firstPartialAt-session.startedAt:null,session:session.coordinator.snapshot(),segments,
     resources};
    current=null;event('recordingFinished',{recordingId:session.id,seconds:lastResult.seconds,segments:segments.length});emit();return lastResult;
   }catch(error){if(current===session)await fail(error);throw error;}
  })();return session.finishPromise;
 }
 async function stopRecord(){
  const session=current;if(!session)throw Error('No active recording');if(session.stop)return session.stop.promise;
  session.stop=deferred();session.stopping=true;emit();
  try{
   session.source?.disconnect();session.stream?.getTracks().forEach(t=>t.stop());
   if(session.node){session.flush=deferred();session.node.port.postMessage('flush');const timer=setTimeout(()=>session.flush.reject(Error('Final capture packet timed out')),3000);try{await session.flush.promise;}finally{clearTimeout(timer);}}
   session.accepting=false;await closeMic(session);emit();const result=await finish(session);session.stop.resolve(result);return result;
  }catch(error){session.stop.reject(error);if(current===session)await fail(error);throw error;}
 }
 async function startInjected(options={}){const session=await begin({...options,injected:true});event('injectedCaptureStarted',{recordingId:session.id});return{recordingId:session.id};}
 async function finishInjected(){const session=current;if(!session)throw Error('No injected capture');session.stopping=true;session.accepting=false;return finish(session);}
 function cancel(){return teardown('Speech capture cancelled; reload before retrying');}
 function unload(){return current?cancel():teardown('Speech unloaded',{graceful:true});}
 function recoveryCoordinators(){return [...new Set([...recoverySources,...(lastSession?[lastSession.coordinator]:[])])].filter(source=>!discardedRecovery.has(source));}
 function getRecoveryAudio(){return recoveryCoordinators().flatMap(source=>source.retainedAudio());}
 function discardRecoveryAudio(recordingId){
  if(typeof recordingId!=='string'||!recordingId)throw Error('Choose the recording whose unarchived audio you want to discard.');
  if(current?.id===recordingId||cleanup?.session?.id===recordingId&&!cleanup.settled)throw Error('Finish recording cleanup before discarding recovery audio.');
  let count=0;
  for(const source of recoveryCoordinators()){
   const records=source.retainedAudio();if(!records.some(record=>record.recordingId===recordingId))continue;
   count+=records.length;recoverySources.delete(source);discardedRecovery.add(source);
  }
  if(!count)throw Error('No unarchived recovery audio for this recording.');
  return count;
 }
 async function listSegments(){return getStore().list();}
 async function getSegment(id){return getStore().get(id);}
 return{load,startRecord,stopRecord,startInjected,pushPcm,finishInjected,cancel,unload,snapshot,listSegments,getSegment,
  getTranscript:()=>current?transcriptText(current):lastResult?.text||(lastSession?transcriptText(lastSession):''),getResult:()=>lastResult,getEvents:()=>events.slice(),getRecoveryAudio,discardRecoveryAudio,
  stats:()=>worker?rpc({type:'stats'}).then(x=>x.resources):Promise.resolve({unloaded:true})};
}
