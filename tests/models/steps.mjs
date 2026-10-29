// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from 'quickpickle';
import {expect} from 'vitest';
import {loadSession} from '../../src/lib/assistant/browser/reference/expanded/lfm3/ort-common.mjs';
import {readout} from '../../src/lib/assistant/browser/reference/expanded/lfm3/protocol.mjs';
import pins from '../../src/lib/assistant/browser/expanded-catalog.json';
Then('the LFM3 loader passes the exact GPU device in its provider options',async()=>{
 const device={label:'explicit-device'};let options;
 const ort={InferenceSession:{create:async(_path,value)=>{options=value;return {};}}};
 await loadSession(ort,{repo:'test/model',revision:'pin',files:[]},'decoder_q4f16',{device});
 expect(options.executionProviders[0].device).toBe(device);
});
Then('the d1 readout normalizes its native slot logits and rejects invalid calibration',()=>{
 const plan={groups:[[0],[1]],labels:['yes','no']};
 const answer=readout([2,0],plan,{default:2});
 expect(answer.choice).toBe('yes');expect(answer.output_tokens).toBe(0);
 expect(answer.probabilities.yes+answer.probabilities.no).toBeCloseTo(1,12);
 expect(()=>readout([NaN,0],plan,{default:2})).toThrow(/Nonfinite/);
 expect(()=>readout([2,0],plan,{default:0})).toThrow(/calibration/);
});
Then('the LFM3 catalog excludes unsupported exports and installs its trained modality graphs',()=>{
 const lfm=pins.filter(p=>p.engine==='lfm3-onnx');expect(lfm).toHaveLength(5);
 expect(lfm.some(p=>p.model==='LiquidAI/d1-2B-ONNX')).toBe(false);
 for(const p of lfm){
  expect(p.artifacts.some(f=>f.id==='onnx/decoder_q4f16.onnx_data')).toBe(true);
  expect(p.artifacts.filter(f=>f.kind!=='notice').every(f=>/resolve\/[a-f0-9]{40}\//.test(f.url))).toBe(true);
  expect(p.settings.context_tokens).toBe(1024);
  if(p.input_mode==='audio')expect(p.artifacts.some(f=>f.id==='onnx/audio_encoder.onnx')).toBe(true);
  expect(p.artifacts.some(f=>/codec|depth/.test(f.id))).toBe(false);
 }
});
Then('the pinned Phonon module resolves its Wasm URL in Blob-backed pthreads',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {patchPhononModule}=await import('../../src/lib/assistant/speech/runtime/phonon-loader.js');
 const source=await readFile('src/public/speech/phonon/phonon_browser.mjs','utf8');
 const patched=patchPhononModule(source,'blob:https://code.superduper.solutions/wasm');
 expect(patched).toContain('return "blob:https://code.superduper.solutions/wasm"');
 expect(patched).not.toContain('new URL("phonon_browser.wasm",import.meta.url).href');
 expect(()=>patchPhononModule('unreviewed runtime','blob:wasm')).toThrow(/pinned build/);
});
