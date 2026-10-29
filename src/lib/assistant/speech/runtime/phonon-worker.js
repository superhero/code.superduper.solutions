// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {patchPhononModule} from './phonon-loader.js';
let engine, busy=false;
self.addEventListener('error',event=>postMessage({type:'error',message:[event.message,event.error?.stack,event.filename].filter(Boolean).join('\n') || 'Phonon worker failed before returning a native error.'}));
function wav(pcm) {
 if(!(pcm instanceof Float32Array)||!pcm.length||pcm.length>30*16000)throw Error('Provide up to 30 seconds of mono 16 kHz audio.');
 const bytes=new ArrayBuffer(44+pcm.length*2),v=new DataView(bytes);
 const text=(offset,value)=>[...value].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
 text(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,pcm.length*2,true);
 pcm.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*(x<0?32768:32767)),true));return new Uint8Array(bytes);
}
self.onmessage=async({data})=>{
 if(busy){postMessage({type:'error',message:'One Phonon operation at a time.'});return;}
 busy=true;
 try {
  if(data.type==='load'){
   const {urls}=data;
   const source=await (await fetch(urls['phonon-js'])).text();
   const moduleURL=URL.createObjectURL(new Blob([patchPhononModule(source,urls['phonon-wasm'])],{type:'text/javascript'}));
   const {default:createPhonon}=await import(/* @vite-ignore */ moduleURL);
   engine=await createPhonon({locateFile:()=>urls['phonon-wasm'],mainScriptUrlOrBlob:moduleURL,print:()=>{},printErr:text=>postMessage({type:'stage',stage:String(text).slice(0,1200)})});
   const bytes=new Uint8Array(await (await fetch(urls['phonon-model'])).arrayBuffer());
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   if(bytes.length!==241719776||hash!=='f0339284e385c89a73ebc860937f1c1c346311efee6a40d995f8623b2d8cf7a3')throw Error('Phonon model checksum differs.');
   engine.FS.writeFile('/model.gguf',bytes,{canOwn:true});
   if(!engine.ccall('phonon_load','number',['string'],['/model.gguf']))throw Error(engine.ccall('phonon_error','string',[],[]));
   engine.FS.unlink('/model.gguf');postMessage({type:'ready'});
  } else if(data.type==='streamEnd'){
   engine.FS.writeFile('/input.wav',wav(data.pcm),{canOwn:true});let ptr;
   try{
    ptr=engine.ccall('phonon_transcribe','number',['string'],['/input.wav']);
    if(!ptr)throw Error(engine.ccall('phonon_error','string',[],[]));
    const result=JSON.parse(engine.UTF8ToString(ptr));
    postMessage({type:'result',sessionId:data.sessionId,text:result.text,stableText:result.text,draftText:''});
   } finally {if(ptr)engine._phonon_free_string(ptr);engine.FS.unlink('/input.wav');}
  } else throw Error('Unsupported Phonon operation.');
 } catch(error){postMessage({type:'error',message:error.message});}
 finally {busy=false;}
};
