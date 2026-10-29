// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import phonon from './phonon-artifacts.json';
import runtime from 'virtual:code-speech';
import lock from './model.lock.json';
import runtimes from '../browser/runtime-artifacts.json';
import {SPEECH_PROFILES} from '../browser/catalog';
import type { SpeechArtifact, SpeechMode } from './types';
export const lfmSpeechProfile = (mode: SpeechMode) => SPEECH_PROFILES.find(p => p.id === (mode === 'lfm3-audio' ? 'lh-browser-lfm3-audio' : mode === 'lfm3-omni' ? 'li-browser-lfm3-omni-audio' : ''));
export const isBatchSpeech = (mode: SpeechMode) => mode === 'phonon' || !!lfmSpeechProfile(mode);
export const speechModes: { id: SpeechMode; label: string; description: string }[] = [
  { id: 'phonon', label: 'Phonon 2.5 · CPU', description: 'CPU · packed weights · transcription after stopping · up to 30 seconds' },
  { id: 'lfm3-audio', label: 'LFM3-Audio · 2B', description: 'WebGPU · transcription after stopping · up to 30 seconds' },
  { id: 'lfm3-omni', label: 'LFM3-Omni · 2B', description: 'WebGPU · transcription after stopping · up to 30 seconds' },
  { id: 'cpu', label: 'CPU · INT8', description: '670 MB model · CPU encoder and decoder' },
  { id: 'gpu-fp16', label: 'WebGPU · FP16 (experimental)', description: '1.26 GB model · requires shader-f16' },
  { id: 'gpu-fp32', label: 'WebGPU · FP32', description: '2.50 GB model · GPU encoder, INT8 CPU decoder' },
];
export const tenRevision = 'd68ab71c8d5fbd8f98e97ae7c9986af76b5d72b1';
const ten = [
  ['ten-js', 'ten_vad.js', '6ad8404430c1fb33b5910032b971e1a4f1d4ca3c9bf76fe456f0b5dcd9e97c7e'],
  ['ten-wasm', 'ten_vad.wasm', '1ec0b9640683987e15a4e54e4ce5642b2447c6e5d82b1be889b5099c75434fc3'],
] as const;
// TEN is obtained unchanged from its publisher, separately from the AGPL application.
import tenSizes from './ten-files.json';
export function speechArtifacts(mode: SpeechMode): SpeechArtifact[] {
  if (mode === 'phonon') return [...phonon, ...runtime.filter(f => ['phonon-worker','capture-worklet'].includes(f.id)).map(f => ({...f,id:f.id === 'phonon-worker' ? 'worker' : f.id}))];
  const lfm = lfmSpeechProfile(mode);
  if (lfm) return [...[...lfm.artifacts!, ...runtimes.lfm3].map(file => ({...file,type:file.kind === 'runtime' ? (file.id === 'ort-wasm' ? 'wasm' : 'js') : file.kind})), ...runtime.filter(file => file.id === 'capture-worklet')] as SpeechArtifact[];
  const encoder = mode === 'cpu' ? 'encoder-model.int8.onnx' : mode === 'gpu-fp16' ? 'encoder-model.fp16.onnx' : 'encoder-model.onnx';
  const names = [encoder, 'decoder_joint-model.int8.onnx', 'vocab.txt', ...(mode === 'gpu-fp32' ? ['encoder-model.onnx.data'] : [])];
  return [...runtime, ...lock.files.filter(file => names.includes(file.file)).map(file => ({
    id: file.file, type: 'model', bytes: file.bytes, sha256: file.sha256,
    url: `https://huggingface.co/${lock.browserArtifact}/resolve/${lock.revision}/${file.file}`,
  })), ...ten.map(([id, name, sha256]) => ({ id, type: name.endsWith('.js') ? 'js' : 'wasm',
    bytes: tenSizes[name], sha256, url: `https://raw.githubusercontent.com/TEN-framework/ten-vad/${tenRevision}/lib/Web/${name}`,
  }))];
}
export const speechPins = lock;
