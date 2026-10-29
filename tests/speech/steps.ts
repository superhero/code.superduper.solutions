// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Given, When, Then, After } from 'quickpickle';
import { expect, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { SentenceMerger } from '../../src/lib/assistant/speech/runtime/sentence-merger.js';
import { SpeechActivity } from '../../src/lib/assistant/speech/runtime/speech-activity.js';
import { LiveDecoder } from '../../src/lib/assistant/speech/runtime/live-decoder.js';
import { ContinuousFeatures } from '../../src/lib/assistant/speech/runtime/features-worker.js';
import { JsPreprocessor } from 'parakeet.js/mel';
import { SpeechController } from '../../src/lib/assistant/speech/controller';
import { serialParakeet, createSpeechRuntime } from '../../build/speech-runtime.mjs';

const words = (text, start = 0) => text.split(' ').map((text, i) => ({ text, start_time: start + i * .2, end_time: start + i * .2 + .18 }));
After(async world => { world.data.controller?.unload(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
Given('a streaming decoder receiving silence', world => {
  world.data.calls = 0;
  world.data.done = new Promise(resolve => world.data.decoder = new LiveDecoder({
    infer: () => { world.data.calls++; return { words: [] }; },
    detect: pcm => [{ start: 0, end: pcm.length / 16000, speech: false }], update: () => {}, finish: resolve, error: error => { throw error; },
  }));
  world.data.decoder.push(new Float32Array(16000 * 3));
});
When('the silent recording stops', async world => { world.data.decoder.end(new Float32Array(0)); world.data.result = await world.data.done; });
Then('the transcript is empty and recognition was never called', world => { expect(world.data.result.text).toBe(''); expect(world.data.calls).toBe(0); });
Given('provisional words followed by a speech pause', world => { world.data.merger = new SentenceMerger(); world.data.merger.update(words('Hello there.')); expect(world.data.merger.snapshot().stableText).toBe(''); });
When('the utterance is finalized', world => { world.data.result = world.data.merger.update([], { pause: true }); });
Then('the mature transcript preserves the recognized sentence', world => { expect(world.data.result.stableText).toBe('Hello there.'); expect(world.data.result.draftText).toBe(''); });
Given('a mature phrase followed by the same phrase later', world => { world.data.merger = new SentenceMerger(); world.data.merger.update(words('Go now.'), { pause: true }); });
When('a new recognition window overlaps the mature phrase', world => { world.data.result = world.data.merger.update([...words('Go now.'), ...words('Go now.', 1)], { final: true }); });
Then('both genuine repetitions remain exactly once', world => { expect(world.data.result.text).toBe('Go now. Go now.'); });
Given('voice activity around a sustained pause', world => {
  const activity = world.data.activity = new SpeechActivity();
  activity.observe([{start: 1,end: 1.25,speech:true},{start:1.25,end:2.3,speech:false},{start:3,end:3.25,speech:true}]); activity.finish(4);
});
Then('two separate speech intervals preserve their surrounding context', world => {
  expect(world.data.activity.segments).toEqual([{start:.7,speechEnd:1.25,end:1.75,closed:true},{start:2.7,speechEnd:3.25,end:3.75,closed:true}]);
});
Given('continuous audio features for overlapping windows', async world => {
  const pcm = Float32Array.from({length:64000}, (_, i) => Math.sin(i * .03) * .3 + Math.cos(i * .07) * .1);
  const continuous = new ContinuousFeatures(128); continuous.push(pcm);
  world.data.first = continuous.compute(0, 32000); world.data.second = continuous.compute(16000, 64000);
  const preprocessor = new JsPreprocessor({nMels:128}), raw = preprocessor.computeRawMel(pcm);
  const T = world.data.second.T, selected = new Float32Array(T * 128);
  for(let m=0;m<128;m++)selected.set(raw.rawMel.subarray(m*raw.nFrames+100,m*raw.nFrames+100+T),m*T);
  world.data.reference = {features:preprocessor.normalizeFeatures(selected,T,T)};
});
Then('the feature values match independent preprocessing within tolerance', world => {
  const a = world.data.second.features, b = world.data.reference.features;
  expect(a.length).toBe(b.length); let max = 0;
  for(let i=0;i<a.length;i++) max = Math.max(max,Math.abs(a[i]-b[i])); expect(max).toBeLessThan(.001);
});
Then('the second window reuses computed feature frames', world => { expect(world.data.second.cachedFrames).toBeGreaterThan(100); expect(world.data.second.newFrames).toBeLessThanOrEqual(2); });
Given('a streaming decoder receiving speech faster than inference', world => {
  world.data.running = 0; world.data.maximum = 0; world.data.partials = [];
  world.data.done = new Promise(resolve => world.data.decoder = new LiveDecoder({
    infer: async (pcm, offset) => { world.data.maximum = Math.max(++world.data.running,world.data.maximum); await new Promise(r=>setTimeout(r,5)); world.data.running--; return {words:words('Hello there.', offset + pcm.length/16000 - .4)}; },
    detect: pcm => { const start = (world.data.count ?? 0)/16000; world.data.count = (world.data.count ?? 0)+pcm.length; return [{start,end:world.data.count/16000,speech:true}]; },
    update: result => world.data.partials.push(result), finish: resolve, error: error => { throw error; },
  }));
  for(let i=0;i<10;i++)world.data.decoder.push(new Float32Array(4000));
});
When('capture stops during recognition', async world => { await new Promise(r=>setTimeout(r,1)); world.data.decoder.end(new Float32Array(0)); world.data.result=await world.data.done; });
Then('all received speech is finalized without concurrent recognition', world => { expect(world.data.maximum).toBe(1); expect(world.data.result.seconds).toBe(2.5); expect(world.data.result.draftText).toBe(''); expect(world.data.result.text).toContain('Hello there.'); });
Then('both CPU and strict WebGPU initialize encoder before decoder', async () => {
  const patched=serialParakeet(await readFile('node_modules/parakeet.js/src/parakeet.js'));
  expect(patched).toContain("['webgpu-hybrid', 'webgpu-strict', 'wasm'].includes(backend)");
  expect(patched.indexOf("onSessionStage?.('encoder_session_ready')")).toBeLessThan(patched.indexOf("onSessionStage?.('decoder_session_start')"));
});
Then('every optional speech runtime file fits the Pages file limit', async () => {
  const {assets,catalog}=await createSpeechRuntime(); expect(catalog.some(file=>file.id==='ort-wasm'&&file.parts?.length===2)).toBe(true);
  for(const bytes of assets.values())expect(bytes.length).toBeLessThan(25*1024*1024);
});
Then('the installed speech factory exposes native WebGPU initialization',async()=>{
  const {assets,catalog}=await createSpeechRuntime();
  const factory=catalog.find(file=>file.id==='ort-mjs')!;
  expect(assets.get(factory.url.replace(/^\.\//,''))!.toString()).toContain('webgpuInit');
});

class FakeWorker extends EventTarget {
  onmessage = null; onerror = null; terminated = false; sent = [];
  postMessage(message) { this.sent.push(message); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage?.({data}); }
}
function controller(world, captureFactory = () => ({start:async()=>({sampleRate:16000}),stop:async()=>{},close:vi.fn()}), restore?) {
  const workers=world.data.workers=[];
  const adapters=world.data.adapters={
    cachedSpeechURLs:vi.fn(restore ?? (async()=>({urls:{worker:'blob:worker','features-worker':'blob:features','capture-worklet':'blob:capture'},close:vi.fn()}))),
    installedSpeech:vi.fn(async()=>['cpu']),installSpeech:vi.fn(),removeSpeech:vi.fn(),save:vi.fn(),
    createWorker:()=>{const worker=new FakeWorker();workers.push(worker);return worker;},createCapture:captureFactory,
  };
  world.data.controller=new SpeechController(adapters);return world.data.controller;
}
async function ready(world) { await world.data.controller.initialize(); world.data.workers.at(-1).emit({type:'ready'}); }
Given('a speech worker blocked while compiling the encoder', async world => {
  const realTimeout=globalThis.setTimeout;
  vi.spyOn(globalThis,'setTimeout').mockImplementation((callback,ms,...args)=>{if(ms===120000){world.data.deadline=callback;world.data.deadlineMs=ms;return 987654;}return realTimeout(callback,ms,...args);});
  controller(world); await world.data.controller.initialize(); world.data.workers[0].emit({type:'stage',stage:'encoder_session_start'});
});
When('120 seconds elapse', world=>{expect(world.data.deadlineMs).toBe(120000);world.data.deadline();});
Then('speech startup fails with its last stage and the worker is terminated', world => {expect(world.data.controller.state.phase).toBe('failed');expect(world.data.controller.state.error).toContain('Compiling encoder');expect(world.data.workers[0].terminated).toBe(true);});
Then('no automatic retry occurs', async world=>{await new Promise(resolve=>setTimeout(resolve,0));expect(world.data.workers).toHaveLength(1);});
When('I manually retry speech startup',async world=>{await ready(world);});
Then('a fresh worker initializes successfully',world=>{expect(world.data.workers).toHaveLength(2);expect(world.data.controller.state.phase).toBe('ready');});
Given('a newly opened controller with a complete CPU speech cache', async world=>{controller(world).setMode('cpu');await world.data.controller.refresh();});
Given('speech input is opened without cross-origin isolation',world=>{vi.stubGlobal('crossOriginIsolated',false);controller(world);});
When('I initialize the cached model',async world=>{await world.data.controller.initialize();world.data.workers.at(-1)?.emit({type:'ready'});});
Then('speech reports the required secure isolation headers without starting a worker',world=>{expect(world.data.controller.state.error).toContain('COOP/COEP');expect(world.data.workers).toHaveLength(0);expect(world.data.adapters.cachedSpeechURLs).not.toHaveBeenCalled();});
Then('the cached URLs are used without another download',world=>{expect(world.data.adapters.installSpeech).not.toHaveBeenCalled();expect(world.data.workers[0].sent[0].urls.worker).toBe('blob:worker');expect(world.data.workers[0].sent[0].mode).toBe('cpu');});
Given('a ready speech controller',async world=>{controller(world);await ready(world);});
When('I record and stop two conversations in sequence', async world=>{
  const service=world.data.controller;world.data.drafts=['',''];let previous='';
  for(let i=0;i<2;i++){
    await service.record(`thread-${i}`,text=>world.data.drafts[i]+=text);
    const worker=world.data.workers[0],id=worker.sent.findLast(message=>message.type==='streamStart').sessionId;
    if(previous)worker.emit({type:'result',sessionId:previous,text:'WRONG',stableText:'WRONG',draftText:''});
    worker.emit({type:'partial',sessionId:id,text:`Draft ${i}.`,stableText:'',draftText:`Draft ${i}.`,seconds:1});
    await service.stop(`thread-${i}`);worker.emit({type:'result',sessionId:id,text:`Draft ${i}.`,stableText:`Draft ${i}.`,draftText:'',seconds:1}); previous=id;
  }
  await new Promise(r=>setTimeout(r,0));
});
Then('each draft receives only its own finalized words',world=>{expect(world.data.drafts).toEqual(['Draft 0.','Draft 1.']);});
Then('no recording audio or transcript is saved separately',world=>{
  expect(world.data.adapters.save).not.toHaveBeenCalled();
  expect(world.data.controller.state.transcript).toBe('');
});
Given('a ready speech controller whose microphone permission is denied',async world=>{
  world.data.denied=true;world.data.closed=vi.fn();controller(world,()=>({start:async()=>{if(world.data.denied)throw new DOMException('Microphone permission denied','NotAllowedError');return {};},stop:async()=>{},close:world.data.closed}));await ready(world);
});
When('I request dictation',async world=>{await world.data.controller.record('owner',()=>{});});
Then('the capture is closed and the failure is recoverable',world=>{expect(world.data.closed).toHaveBeenCalled();expect(world.data.controller.state.phase).toBe('failed');expect(world.data.controller.state.error).toContain('denied');});
When('I retry after granting microphone access',async world=>{world.data.denied=false;await ready(world);await world.data.controller.record('owner',()=>{});});
Then('dictation can start and stop successfully',async world=>{expect(world.data.controller.state.phase).toBe('recording');await world.data.controller.stop('owner');expect(world.data.controller.state.phase).toBe('stopping');});
Given('a ready speech controller waiting for microphone permission',async world=>{
  world.data.closed=vi.fn();controller(world,()=>({start:()=>new Promise(resolve=>world.data.grant=resolve),stop:async()=>{},close:world.data.closed}));await ready(world);world.data.recording=world.data.controller.record('owner',()=>{});
});
When('I cancel dictation before permission is granted',async world=>{await world.data.controller.stop('owner');world.data.grant({sampleRate:16000});await world.data.recording;});
Then('a late permission response cannot start recording',world=>{expect(world.data.controller.state.phase).toBe('failed');expect(world.data.closed).toHaveBeenCalled();});
Given('cached model restoration is still pending',world=>{world.data.closeURLs=vi.fn();controller(world,undefined,()=>new Promise(resolve=>world.data.restore=resolve));world.data.loading=world.data.controller.initialize();});
When('I cancel model initialization',async world=>{world.data.controller.unload();world.data.restore({urls:{worker:'blob:late'},close:world.data.closeURLs});await world.data.loading;});
Then('the late restored URLs are revoked and no worker starts',world=>{expect(world.data.closeURLs).toHaveBeenCalledOnce();expect(world.data.workers).toHaveLength(0);expect(world.data.controller.state.phase).toBe('idle');});
Then('{string} captures without streaming and releases after final transcription', async (world, mode) => {
  let push;
  const service=controller(world,()=>({start:async(_url,chunk)=>{push=chunk;return{sampleRate:16000};},stop:async()=>{},close:vi.fn()}));
  service.setMode(mode);
  await service.initialize();
  const worker=world.data.workers[0];worker.emit({type:'ready'});
  const drafts=[];
  await service.record('batch-owner',text=>drafts.push(text));
  push(new Float32Array(16000));
  expect(worker.sent.some(message=>['streamStart','streamChunk'].includes(message.type))).toBe(false);
  await service.stop('batch-owner');
  const end=worker.sent.find(message=>message.type==='streamEnd');
  expect(end.pcm.length).toBe(16000);
  let released=false;
  const waiting=service.releaseForLanguage(new AbortController().signal).then(()=>released=true);
  await Promise.resolve();expect(released).toBe(false);
  worker.emit({type:'result',sessionId:end.sessionId,text:'Recognized words.',stableText:'Recognized words.',draftText:''});
  await waiting;
  expect(drafts).toEqual(['Recognized words.']);
  expect(worker.terminated).toBe(true);expect(service.state.phase).toBe('idle');
});
