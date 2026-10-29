// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {LiveDecoder} from './live-decoder.js';
export function pcmWave(pcm) {
  if (!(pcm instanceof Float32Array) || !pcm.length || pcm.length > 30*16000) throw Error('Provide a nonempty speech window of at most 30 seconds.');
  const bytes=new ArrayBuffer(44+pcm.length*2),v=new DataView(bytes);
  const text=(offset,value)=>[...value].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
  text(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,pcm.length*2,true);
  pcm.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*(x<0?32768:32767)),true));
  return new Uint8Array(bytes);
}
export async function transcribePhonon(engine, pcm) {
  engine.FS.writeFile('/input.wav',pcmWave(pcm),{canOwn:true});let ptr;
  try {
    ptr=await engine.ccall('phonon_transcribe','number',['string'],['/input.wav'],{async:true});
    if (!ptr) throw Error(engine.ccall('phonon_error','string',[],[]));
    return JSON.parse(engine.UTF8ToString(ptr));
  } finally {if(ptr)engine._phonon_free_string(ptr);engine.FS.unlink('/input.wav');}
}
export function createPhononDecoder({vad,transcribe,valid,update,finish,error}) {
  vad.reset();
  return new LiveDecoder({maxContextSeconds:30,detect:pcm=>vad.process(pcm),
    infer:async(pcm,offset)=>{
      const result=await transcribe(pcm);
      if(!valid())throw Error('Stale Phonon streaming inference.');
      return {words:result.words.map(word=>({text:word.w,start_time:offset+word.start,end_time:offset+word.end}))};
    },
    update:value=>{if(valid())update(value);},
    finish:value=>{if(valid())finish(value);},
    error:failure=>{if(valid())error(failure);},
  });
}
