// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as ort from 'onnxruntime-web';
import {AutoTokenizer, env} from '@huggingface/transformers';
import {useInstalledAssets} from './worker-assets.js';
import {loadSession, generate} from './lfm3/ort-common.mjs';
import {imagePatches, logMel} from './lfm3/preprocess.mjs';
import {decide} from './lfm3/protocol.mjs';
let profile, device, decoder, encoder, tokenizer, config, processor, calibration, base, pin;
const sessions = [];
async function json(name) { const r = await fetch(base + name); if (!r.ok) throw Error('Missing installed metadata: ' + name); return r.json(); }
async function release() { for (const session of sessions.splice(0)) await session.release(); device?.destroy(); device = null; }
async function session(stem) { const value = await loadSession(ort, pin, stem, {base,device,log:message=>postMessage({type:'progress',progress:{message}})}); sessions.push(value); return value; }
async function load(data) {
  profile=data.profile; useInstalledAssets(data.assets);
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths={mjs:data.assets.runtimeURLs['ort-mjs'],wasm:data.assets.runtimeURLs['ort-wasm']};
  env.allowLocalModels=false; env.useBrowserCache=false; env.remotePathTemplate=`{model}/resolve/${profile.revision}/`;
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if (!adapter?.features.has('shader-f16')) throw Error('LFM3 requires WebGPU shader-f16.');
  const requiredFeatures=['shader-f16',...(adapter.features.has('subgroups')?['subgroups']:[])];
  const requiredLimits=Object.fromEntries(['maxBufferSize','maxStorageBufferBindingSize','maxComputeWorkgroupStorageSize','maxComputeWorkgroupsPerDimension','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ','maxStorageBuffersPerShaderStage'].map(k=>[k,adapter.limits[k]]));
  device=await adapter.requestDevice({requiredFeatures,requiredLimits});
  // The actual device must reach each provider; the global ORT field alone is insufficient.
  base=`https://huggingface.co/${profile.model}/resolve/${profile.revision}/`;
  pin={repo:profile.model,revision:profile.revision,files:profile.artifacts.map(f=>({path:f.id}))};
  config=await json('config.json');
  tokenizer=await AutoTokenizer.from_pretrained(profile.model,{revision:profile.revision});
  tokenizer.chat_template=await (await fetch(base+'chat_template.jinja')).text();
  if(profile.category==='decision') calibration=await json('calibration.json');
  else {processor=await json('processor_config.json');encoder=await session(profile.input_mode==='audio'?'audio_encoder':'vision_encoder_q8');}
  decoder=await session('decoder_q4f16');
  return {engine:'lfm3-onnx',context_tokens:1024,device_features:[...device.features],input_modalities:profile.input_mode==='audio'?['audio']:['image']};
}
async function infer(data) {
  let features;
  try {
    let messages,token,side={};
    if(profile.input_mode==='audio') {
      const samples=data.audio;
      if(!(samples instanceof Float32Array)||!samples.length||samples.length>30*16000) throw Error('Provide up to 30 seconds of mono 16 kHz audio.');
      const mel=logMel(ort,samples,processor.feature_extractor);
      try {features=(await encoder.run({input_features:mel})).audio_features;} finally {mel.dispose();}
      side.audio_features=features;token=config.audio_token_id??125031;
      messages=[{role:'system',content:'Perform ASR.'},{role:'user',content:[{type:'audio'}]}];
    } else {
      const image=data.image?.image ?? data.image;
      if(!image?.data) throw Error('An image is required.');
      const bytes=Uint8Array.from(atob(image.data),c=>c.charCodeAt(0));
      if(bytes.length > 10*1024*1024) throw Error('Images must fit within 10 MiB.');
      const bitmap=await createImageBitmap(new Blob([bytes],{type:image.mimeType}));
      let input;
      try {if(bitmap.width*bitmap.height>16*1024*1024 || bitmap.width>8192 || bitmap.height>8192) throw Error('Images must fit within 16 megapixels and 8,192 pixels per side.');const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);input=imagePatches(ort,ctx.getImageData(0,0,bitmap.width,bitmap.height),processor.image_processor);} finally {bitmap.close();}
      try {features=Object.values(await encoder.run({pixel_values:input}))[0];} finally {input.dispose();}
      side.image_features=features;token=config.image_token_id;
      const question=data.messages?.filter(m=>m.role==='user').at(-1)?.content;
      messages=[{role:'user',content:[{type:'image'},{type:'text',text:typeof question==='string'?question:'Describe this image.'}]}];
    }
    let ids=Array.from(tokenizer.apply_chat_template(messages,{tokenize:true,return_tensor:false,return_dict:false,add_generation_prompt:true,enable_thinking:false}),Number);
    if(!ids.includes(token)) throw Error('The trained modality placeholder is missing.');
    ids=ids.flatMap(id=>id===token?Array(features.dims[0]).fill(token):[id]);
    const maxTokens=Math.min(256,data.maxTokens??256);
    const tokens=await generate(ort,decoder,ids,{side,maxTokens,eos:[config.eos_token_id??124900]});
    return {text:tokenizer.decode(tokens,{skip_special_tokens:true}),usage:{prompt_tokens:ids.length,completion_tokens:tokens.length},finish_reason:'stop'};
  } finally {features?.dispose();}
}
let busy=false;
self.onmessage=async({data})=>{
  const speech=!!data.speech;
  if(data.type==='load' && data.urls) data.assets={files:data.profile.artifacts.map(f=>({...f,url:new URL(f.url,data.baseURL).href})),runtimeURLs:data.urls,fileURLs:data.urls};
  if(data.type==='streamEnd'){data.type='transcribe';data.audio=data.pcm;}
  if(busy){postMessage({id:data.id,type:'error',message:'One LFM3 operation at a time.'});return;}
  busy=true;
  try {
    let result;
    if(data.type==='load') result=await load(data);
    else if(data.type==='generate'||data.type==='transcribe') result=await infer(data);
    else if(data.type==='decide') result=await decide(ort,decoder,tokenizer,calibration,data.state,data.question);
    else if(data.type==='dispose') await release();
    else throw Error('Unsupported LFM3 operation.');
    if(speech) postMessage(data.type==='load'?{type:'ready'}:{type:'result',sessionId:data.sessionId,text:result.text,stableText:result.text,draftText:''});
    else postMessage({id:data.id,type:'result',result});
  } catch(error) {if(data.type==='load') await release().catch(()=>{});postMessage({id:data.id,type:'error',message:error.message});}
  finally {busy=false;}
};
