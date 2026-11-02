// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as ort from 'onnxruntime-web/webgpu';
import {TenVad} from './ten-vad.js';
import {createDetector as fireRed} from './vad/firered/index.js';
import {createDetector as fsmn} from './vad/fsmn/index.js';
import {createDetector as marbleNet} from './vad/marblenet/index.js';
/** GPU VAD shares ASR's explicit device; CPU substitution is never automatic. */
export async function createSpeechVad(mode='ten',assets,device){
 if(mode==='ten'){
  const response=await fetch(assets.wasm);if(!response.ok)throw Error('Cached TEN-VAD is unavailable. Install speech again.');
  const vad=await TenVad.create(assets.module,new Uint8Array(await response.arrayBuffer()),assets.wasm);
  vad.info={family:'TEN',backend:'CPU · Wasm',frameMs:16};return vad;
 }
 const factory={firered:fireRed,fsmn,marblenet:marbleNet}[mode];
 if(!factory)throw Error(mode==='silero'?'Silero GPU failed probability correctness and is unsupported.':'Choose a supported speech detector.');
 if(!device)throw Error('The selected speech detector requires a usable WebGPU device; CPU fallback is disabled.');
 const facade={...ort,InferenceSession:{create:(model,options={})=>ort.InferenceSession.create(model,{...options,
  executionProviders:[{name:'webgpu',device}],logSeverityLevel:2,logVerbosityLevel:0,enableProfiling:false,
  extra:{...options.extra,session:{...options.extra?.session,disable_cpu_ep_fallback:'1'}}})}};
 const detector=await factory({backend:'gpu',ort:facade,assets,device});
 Object.assign(detector.info,{selected_backend:'WebGPU',cpu_model_fallback:false});return detector;
}
