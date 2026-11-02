// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {createSegmentStore} from './runtime/continuous/segment-store.js';
import type {SpeechAudio} from './continuous-types';
const open=()=>createSegmentStore({name:'code-speech-segments-v1'});
export async function speechRecordings(){const store=open();try{return await store.list();}finally{await store.close();}}
export async function removeSpeechRecording(id:string){const store=open();try{await store.removeRecording(id);}finally{await store.close();}}
function header(samples:number){
 const buffer=new ArrayBuffer(44),view=new DataView(buffer);const text=(at:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
 if(samples*2>0xffffffff-36)throw Error('This recording exceeds the WAV file size limit. Export individual audio segments instead.');
 text(0,'RIFF');view.setUint32(4,36+samples*2,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples*2,true);return buffer;
}
function pcmPart(record:SpeechAudio){
 const start=record.coreStartSample-record.audioStartSample,count=record.endSample-record.coreStartSample;
 if(start<0||count<0||start+count>record.pcm.length)throw Error('Archived speech samples are incomplete.');
 const buffer=new ArrayBuffer(count*2),view=new DataView(buffer);
 for(let i=0;i<count;i++){const sample=Math.max(-1,Math.min(1,record.pcm[start+i]!));view.setInt16(i*2,Math.round(sample*(sample<0?32768:32767)),true);}
 return new Blob([buffer]);
}
export function recoveryWave(records:SpeechAudio[]):Blob{
 const sorted=records.slice().sort((a,b)=>a.coreStartSample-b.coreStartSample),samples=sorted.reduce((sum,r)=>sum+r.endSample-r.coreStartSample,0);
 return new Blob([header(samples),...sorted.map(pcmPart)],{type:'audio/wav'});
}
/** Read only one archived segment at a time; exclude overlap from exported cores. */
export async function speechRecordingWave(id:string):Promise<Blob>{
 const store=open();try{
  const rows=await store.list(id);if(!rows.length)throw Error('This local recording is unavailable.');
  const samples=rows.reduce((sum,r)=>sum+r.endSample-r.coreStartSample,0),parts:BlobPart[]=[header(samples)];let next=0;
  for(const row of rows){
   if(row.coreStartSample!==next)throw Error('This archive has a gap. Export recovery segments before removing it.');
   const record=await store.get(row.sessionId);if(!record)throw Error('Archived speech audio is missing.');parts.push(pcmPart(record));next=row.endSample;
  }
  return new Blob(parts,{type:'audio/wav'});
 }finally{await store.close();}
}
