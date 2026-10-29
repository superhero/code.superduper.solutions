// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from LL/LM Phonon GPU references; phonon-shared-sources.json owns provenance.
import {patchPhononModule} from './phonon-loader.js';
import {TenVad} from './ten-vad.js';
import {createPhononDecoder,transcribePhonon} from './phonon-stream.js';
let engine,vad,live,sessionId,loading=false;
const diagnostics=[];
const diagnostic=text=>{diagnostics.push(String(text).slice(0,1200));if(diagnostics.length>8)diagnostics.shift();};
const gpu={dispatches:0,submissions:0,errors:[],peakBufferBytes:0,liveBufferBytes:0,inFlight:0,maxInFlight:0};
function observeGPU() {
  const sizes=new WeakMap(),create=GPUDevice.prototype.createBuffer,destroy=GPUBuffer.prototype.destroy;
  GPUDevice.prototype.createBuffer=function(desc){const b=Reflect.apply(create,this,[desc]);sizes.set(b,desc.size);gpu.liveBufferBytes+=desc.size;gpu.peakBufferBytes=Math.max(gpu.peakBufferBytes,gpu.liveBufferBytes);return b;};
  GPUBuffer.prototype.destroy=function(){const n=sizes.get(this)||0;gpu.liveBufferBytes-=n;sizes.delete(this);return Reflect.apply(destroy,this,[]);};
  for(const name of ['dispatchWorkgroups','dispatchWorkgroupsIndirect']){
    const original=GPUComputePassEncoder.prototype[name];
    GPUComputePassEncoder.prototype[name]=function(...args){gpu.dispatches++;return Reflect.apply(original,this,args);};
  }
  const submit=GPUQueue.prototype.submit;
  GPUQueue.prototype.submit=function(...args){gpu.submissions++;return Reflect.apply(submit,this,args);};
  const request=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(...args){const device=await Reflect.apply(request,this,args);device.addEventListener('uncapturederror',event=>{gpu.errors.push(event.error.message);postMessage({type:'error',message:event.error.message});});return device;};
}
const send=(type,value={})=>postMessage({type,sessionId,...value});
self.addEventListener('error',event=>send('error',{message:[event.message||event.error?.stack||'Phonon GPU worker failed.',...diagnostics].join('\n')}));
async function load(urls) {
  if(loading||engine)throw Error('Phonon is already loading or loaded.');loading=true;
  try {
    if(typeof WebAssembly.Suspending!=='function'||typeof WebAssembly.promising!=='function')throw Error('Phonon GPU requires WebAssembly JSPI.');
    observeGPU();
    send('stage',{stage:'Starting Phonon GPU runtime'});
    const source=await (await fetch(urls['phonon-js'])).text();
    const moduleURL=URL.createObjectURL(new Blob([patchPhononModule(source,urls['phonon-wasm'])],{type:'text/javascript'}));
    const {default:createPhonon}=await import(/* @vite-ignore */ moduleURL);
    engine=await createPhonon({locateFile:()=>urls['phonon-wasm'],mainScriptUrlOrBlob:moduleURL,print:()=>{},printErr:diagnostic});
    const bytes=new Uint8Array(await (await fetch(urls['phonon-model'])).arrayBuffer());
    const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(bytes.length!==241719776||sha!=='f0339284e385c89a73ebc860937f1c1c346311efee6a40d995f8623b2d8cf7a3')throw Error('Phonon model checksum differs.');
    send('stage',{stage:'Expanding and uploading Phonon weights to GPU'});
    engine.FS.writeFile('/model.gguf',bytes,{canOwn:true});
    try {if(!await engine.ccall('phonon_load','number',['string'],['/model.gguf'],{async:true}))throw Error(engine.ccall('phonon_error','string',[],[]));}
    finally {engine.FS.unlink('/model.gguf');}
    const backend=JSON.parse(engine.ccall('phonon_gpu_info','string',[],[]));
    if(!backend.gpu)throw Error('Phonon did not select a GPU backend.');
    vad=await TenVad.create(urls['ten-js'],new Uint8Array(await(await fetch(urls['ten-wasm'])).arrayBuffer()),urls['ten-wasm']);
    send('ready',{runtime:{backend,gpu:{...gpu},streaming:'speech-aware repeated windows'}});
  } finally {loading=false;}
}
self.onmessage=({data})=>{
  if(data.type==='load'){void load(data.urls).catch(error=>send('error',{message:error.message}));return;}
  if(data.type==='streamStart'){
    if(!engine||!vad||live&&!live.ended){send('error',{message:'Finish the active Phonon session before restarting.'});return;}
    sessionId=data.sessionId;const id=sessionId;
    live=createPhononDecoder({vad,valid:()=>sessionId===id,
      transcribe:async pcm=>{
        gpu.maxInFlight=Math.max(gpu.maxInFlight,++gpu.inFlight);
        send('inference',{active:true});
        const timer=setTimeout(()=>send('error',{message:'Phonon GPU recognition exceeded 60 seconds.'}),60000);
        try {
          const before=gpu.dispatches,result=await transcribePhonon(engine,pcm);
          if(gpu.dispatches<=before)throw Error('Phonon inference did not dispatch GPU work.');
          if(gpu.errors.length)throw Error(gpu.errors.at(-1));
          return result;
        } finally {clearTimeout(timer);gpu.inFlight--;send('inference',{active:false});}
      },
      update:value=>send('partial',{...value,gpu:{...gpu}}),
      finish:value=>send('result',{...value,gpu:{...gpu}}),
      error:error=>send('error',{message:error.message}),
    });return;
  }
  if(data.sessionId!==sessionId)return;
  if(data.type==='streamChunk')live?.push(data.pcm);
  else if(data.type==='streamEnd')live?.end(data.pcm);
};
