// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Streaming pipeline adapted from llm-sds-01 / ao-browser-parakeet-streaming.
import { fromUrls } from 'parakeet.js';
import * as ort from 'onnxruntime-web';
import { LiveDecoder } from './live-decoder.js';
import { LiveFeatures } from './live-features.js';
import { TenVad } from './ten-vad.js';
let model, vad, features, live, sessionId, mode;
const send = (type, data = {}) => self.postMessage({ type, sessionId, ...data });
const stage = name => send('stage', { stage: name });
let queue = Promise.resolve();
self.onmessage = ({ data }) => { queue = queue.then(() => handle(data)).catch(error => send('error', { message: error.message || String(error) })); };
async function handle(data) {
  if (data.type === 'load') {
    mode = data.mode; const urls = data.urls;
    ort.env.wasm.wasmPaths = { mjs: urls['ort-mjs'], wasm: urls['ort-wasm'] };
    ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const gpu = mode !== 'cpu';
    if (gpu) {
      stage('requesting_gpu');
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('WebGPU is unavailable. Choose CPU explicitly to use it.');
      if (mode === 'gpu-fp16' && !adapter.features.has('shader-f16')) throw new Error('Experimental FP16 requires shader-f16.');
      ort.env.webgpu.adapter = adapter;
      stage('decoder_bootstrap_start');
      const bootstrap = await ort.InferenceSession.create(urls['decoder_joint-model.int8.onnx'], { executionProviders: ['wasm'] });
      await bootstrap.release(); stage('decoder_bootstrap_ready');
    }
    const encoder = mode === 'cpu' ? 'encoder-model.int8.onnx' : mode === 'gpu-fp16' ? 'encoder-model.fp16.onnx' : 'encoder-model.onnx';
    model = await fromUrls({ encoderUrl: urls[encoder], decoderUrl: urls['decoder_joint-model.int8.onnx'],
      tokenizerUrl: urls['vocab.txt'], encoderDataUrl: urls['encoder-model.onnx.data'],
      filenames: { encoder, decoder: 'decoder_joint-model.int8.onnx' }, backend: gpu ? 'webgpu-strict' : 'wasm',
      preprocessorBackend: 'js', cpuThreads: 1, nMels: 128,
      wasmPaths: ort.env.wasm.wasmPaths, onSessionStage: stage,
    });
    stage('speech_detector_start');
    vad = await TenVad.create(urls['ten-js'], new Uint8Array(await (await fetch(urls['ten-wasm'])).arrayBuffer()), urls['ten-wasm']);
    send('ready', { runtime: { parakeet: '1.4.4', ort: ort.env.versions, mode, decoder: 'int8-cpu', threads: 1 } });
  } else if (data.type === 'streamStart') {
    if (!model || !vad) throw new Error('Initialize speech before recording.');
    sessionId = data.sessionId; features?.close(); features = new LiveFeatures(128, data.featurePort);
    model.resetMelCache?.(); model.resetIncrementalCache?.(); vad.reset();
    const id = sessionId;
    live = new LiveDecoder({ maxContextSeconds: mode === 'cpu' ? 6 : 30, detect: pcm => vad.process(pcm),
      infer: async (pcm, timeOffset) => {
        const start = Math.round(timeOffset * 16000), cached = await features.compute(start, start + pcm.length);
        const result = await model.transcribe(pcm, 16000, { returnTimestamps: true, timeOffset, precomputedFeatures: cached });
        return { ...result, preprocessing: { cachedFrames: cached.cachedFrames, newFrames: cached.newFrames, totalComputedFrames: cached.totalComputedFrames } };
      },
      update: result => { if (id === sessionId) send('partial', result); },
      finish: result => { if (id === sessionId) { features.close(); send('result', result); } },
      error: error => { if (id === sessionId) send('error', { message: error.message }); },
    });
  } else if (data.sessionId === sessionId && data.type === 'streamChunk') live.push(data.pcm);
  else if (data.sessionId === sessionId && data.type === 'streamEnd') live.end(data.pcm);
}
