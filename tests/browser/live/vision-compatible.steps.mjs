// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {liveBrowser} from './browser-models.steps.mjs';
const visionId='ox-browser-lfm25-vision-compatible',textId='kh-browser-assistant-minicpm5-2b';
async function picture(page,text=''){
 return page.evaluate(text=>{
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,512,256);
  if(text){c.fillStyle='black';c.font='bold 64px sans-serif';c.fillText(text,24,150);}else{c.fillStyle='red';c.fillRect(152,24,208,208);}
  return{type:'image',mimeType:'image/png',data:canvas.toDataURL('image/png').split(',')[1],width:512,height:256};
 },text);
}
function gpu(answer){assert.equal(answer.gpu_execution.queue_drain,'complete');assert.ok(answer.gpu_execution.delta.queue_drained_dispatches>0);}
async function configure(page){await page.evaluate(async({textId,visionId})=>{const s=await import('/lib/assistant/browser/storage.ts');await s.saveModelSettings(textId,{...await s.readModelSettings(textId),visionTool:visionId});},{textId,visionId});}
Then('the compatible image model reads colored shapes and visible text with drained GPU work',async function(){
 const{page}=liveBrowser();this.case.model=visionId;
 this.case.facts=await page.evaluate(async()=>{const{probeBrowser}=await import('/lib/assistant/browser/compatibility.js');return probeBrowser();});
 assert.equal(this.case.facts.gpu.f16_compute,false);assert.ok(this.case.facts.gpu.limits.max_storage_buffers_per_shader_stage>=9);
 const image=await picture(page);
 this.case.shape=await page.evaluate(async({visionId,image})=>modelLive.runtime.inspectBrowserImage(visionId,image,'Name the color and shape. Answer briefly.',new AbortController().signal),{visionId,image});
 assert.match(this.case.shape.text,/red/i);assert.match(this.case.shape.text,/square/i);gpu(this.case.shape);
 const code='PINE-'+String(Math.floor(Math.random()*9000)+1000),text=await picture(page,code);
 this.case.ocr=await page.evaluate(async({visionId,image})=>modelLive.runtime.inspectBrowserImage(visionId,image,'Read any visible text. Give only that text; if none is visible reply exactly NO TEXT.',new AbortController().signal),{visionId,image:text});
 assert.ok(this.case.ocr.text.includes(code),this.case.ocr.text);gpu(this.case.ocr);
 assert.equal(await page.evaluate(()=>modelLive.runtime.loadedModel()),undefined);
});
Then('a strict text agent inspects the image and retains its progressive skill and file results',async function(){
 const{page,choose}=liveBrowser();await configure(page);await choose(textId);
 const code='PINE-'+String(Math.floor(Math.random()*9000)+1000),secret='GPU-'+randomUUID().slice(0,8).toUpperCase(),image=await picture(page,code);
 this.case.exchange=await page.evaluate(async({textId,secret,image})=>{
  const[{repositoryClient},{repositoryTools},{skillTools},store]=await Promise.all([import('/lib/repository/client.ts'),import('/lib/assistant/tools.ts'),import('/lib/assistant/skill-tools.ts'),import('/lib/assistant/browser/storage.ts')]);
  const repository=await repositoryClient.create('Vision tool verification',[{path:'notes/check.txt',data:new TextEncoder().encode('Confirmation code: '+secret+'\n')}]);
  const skills={'image-check':{description:'Verify an image and a repository note together.',enabled:true,instructions:'First call read_file for notes/check.txt and remember its entire Confirmation code, including GPU- prefix. Then call inspect_image for image_1 to read its visible text. Finish with exactly one line: the image code, then a space, vertical bar, space, then the entire repository Confirmation code. Do not add explanations, examples or other codes.'}};
  const conversation=[{role:'user',content:'Load the image-check skill. Follow this order: read notes/check.txt first; then inspect image_1. Finish with one line containing the image code | the entire repository Confirmation code. No commentary or other codes.',images:[image]}],before=JSON.stringify(conversation),saved=JSON.stringify(await store.readModelSettings(textId)),activities=[];
  const files=repositoryTools({id:repository.id,revision:repository.revision,files:repository.files,read:path=>repositoryClient.read(repository.id,path)},{list_files:false,read_file:true,search_text:false});
  let text='',state;
  const signal=new AbortController().signal;
  await modelLive.runtime.runBrowserTurn(async load=>{
   await load(textId,()=>{},signal);const control=await modelLive.runtime.browserVisionTool(textId,conversation,()=>{});
   try{await new modelLive.BrowserAgentHarness().run(modelLive.runtime.browserPlugin(textId,()=>{},control.reference),textId,conversation,signal,part=>text+=part,{instructions:'Use the enabled skill and actual tools. Required order: load_skill, read_file, inspect_image. Remember the file result through image inspection. Your final answer must be one line: image code | entire repository Confirmation code. No examples or invented values.',skills,contextWindow:4096,tools:[...skillTools(skills),...files,control.tool],onTool:activity=>activities.push(structuredClone(activity)),onUsage:()=>{},maxModelTurns:8,maxToolCalls:8});state=control.state;}
   finally{await control.dispose();}
  },signal);
  return{text,state,activities,conversationUnchanged:JSON.stringify(conversation)===before,settingsUnchanged:JSON.stringify(await store.readModelSettings(textId))===saved,loaded:modelLive.runtime.loadedModel(),info:modelLive.runtime.loadedModelInfo()};
 },{textId,secret,image});
 const e=this.case.exchange;assert.equal(e.text.trim(),code+' | '+secret,e.text);
 const completed=e.activities.filter(a=>a.status==='completed').map(a=>a.name);assert.equal(completed[0],'load_skill');assert.ok(completed.includes('read_file'));assert.ok(completed.includes('inspect_image'));assert.ok(completed.indexOf('read_file')<completed.indexOf('inspect_image'),JSON.stringify(completed));
 assert.equal(e.state.text_ready,true);assert.equal(e.state.cleanup_failed,false);assert.ok(e.conversationUnchanged&&e.settingsUnchanged);assert.equal(e.loaded,textId);assert.equal(e.info.placement.cpu_compute_ops,0);assert.ok(e.info.placement.gpu_compute_ops>0);
});
Then('the editor refuses eight-buffer image execution before suspending strict text',async function(){
 const{page,choose}=liveBrowser();await configure(page);await choose(textId);const image=await picture(page);
 this.case.preflight=await page.evaluate(async({textId,image})=>{
  const gpu=navigator.gpu,request=gpu.requestAdapter.bind(gpu);gpu.requestAdapter=async options=>{
   const adapter=await request(options);return{features:adapter.features,info:adapter.info,requestDevice:adapter.requestDevice.bind(adapter),limits:{maxBufferSize:adapter.limits.maxBufferSize,maxStorageBufferBindingSize:adapter.limits.maxStorageBufferBindingSize,maxStorageBuffersPerShaderStage:8}};
  };
  let error='',state;
  try{await modelLive.runtime.runBrowserTurn(async()=>{const control=await modelLive.runtime.browserVisionTool(textId,[{role:'user',content:'Describe it.',images:[image]}],()=>{});try{await control.tool.execute('unsupported',{image_id:'image_1',question:'Describe it.'},new AbortController().signal);}catch(e){error=e.message;}finally{state=control.state;await control.dispose();}},new AbortController().signal);}
  finally{gpu.requestAdapter=request;}
  return{error,state,loaded:modelLive.runtime.loadedModel()};
 },{textId,image});
 assert.match(this.case.preflight.error,/9 storage buffers/);assert.equal(this.case.preflight.loaded,textId);assert.equal(this.case.preflight.state.text_ready,true);
});
Then('cancelling an active image request releases it and cached vision reloads offline',async function(){
 const{page,context}=liveBrowser(),image=await picture(page);
 await page.evaluate(()=>{
  const Original=Worker;globalThis.visionCancelled={started:false,terminated:false};
  globalThis.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('message',({data})=>{if(this.compatible&&data.type==='text'&&!visionCancelled.started){visionCancelled.started=true;modelLiveController.abort();}});}
   postMessage(data,...args){if(data.type==='load'&&data.pin?.precisionVariant==='official-q4-fp32-compatible-v1')this.compatible=true;super.postMessage(data,...args);}
   terminate(){if(this.compatible)visionCancelled.terminated=true;super.terminate();}
  };
 });
 this.case.cancel=await page.evaluate(async({visionId,image})=>{
  globalThis.modelLiveController=new AbortController();let error='',name='';
  try{await modelLive.runtime.inspectBrowserImage(visionId,image,'Describe every visible detail in several complete sentences.',modelLiveController.signal);}catch(e){error=e.message;name=e.name;}
  return{error,name,...visionCancelled,loaded:modelLive.runtime.loadedModel()};
 },{visionId,image});
 assert.equal(this.case.cancel.started,true);assert.equal(this.case.cancel.terminated,true);assert.equal(this.case.cancel.name,'AbortError');assert.equal(this.case.cancel.loaded,undefined);
 const blocked=[];const reject=async route=>{blocked.push(route.request().url());await route.abort('failed');};await context.route('https://huggingface.co/**',reject);await context.route('https://*.hf.co/**',reject);
 try{
  this.case.offline=await page.evaluate(async({visionId,image})=>modelLive.runtime.inspectBrowserImage(visionId,image,'Name the color and shape. Answer briefly.',new AbortController().signal),{visionId,image});
  assert.match(this.case.offline.text,/red/i);gpu(this.case.offline);assert.deepEqual(blocked,[]);
 }finally{await context.unroute('https://huggingface.co/**',reject);await context.unroute('https://*.hf.co/**',reject);}
 assert.equal(await page.evaluate(()=>modelLive.runtime.loadedModel()),undefined);
});
