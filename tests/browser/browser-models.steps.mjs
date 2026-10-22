// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { rolldown } from 'rolldown';
import { mkdir, writeFile } from 'node:fs/promises';
import { BROWSER_PROFILES } from '../../src/lib/assistant/browser/catalog.ts';
import { selectDropdown } from './navigation.helpers.mjs';
let fixtureCode;
async function fixture(page) {
  if(!fixtureCode) {
    const bundle=await rolldown({input:'tests/fixtures/browser-models.ts'});
    try {fixtureCode=(await bundle.generate({format:'iife',name:'browserModelsFixture',codeSplitting:false})).output[0].code;} finally {await bundle.close();}
  }
  await page.addScriptTag({content:fixtureCode});
}
async function controls(page) {
  await page.getByRole('button',{name:'AI chat',exact:true}).click();
  await page.getByRole('button',{name:'AI connections',exact:true}).click();
  return page.getByRole('region',{name:'AI connections',exact:true}).getByRole('region',{name:'Browser models',exact:true});
}
// A section with an accessible name has a region role, so scopes match the UI.
Then('browser model controls expose six pinned profiles and retain generation settings without downloading weights',{timeout:60000},async function(){
  const page=this.page;const card=await controls(page);
  await expect(card.getByRole('button',{name:'Browser model',exact:true})).toContainText(BROWSER_PROFILES[0].title);
  for(const profile of BROWSER_PROFILES) {
    await selectDropdown(page,'Browser model',profile.id);
    await expect(card).toContainText(profile.limitations);
    await expect(card).toContainText(profile.engine==='webml'?'WebML · WebGPU':'Wllama / llama.cpp');
    await expect(card.getByRole('button',{name:`Install ${profile.title}`,exact:true})).toBeEnabled();
  }
  await selectDropdown(page,'Browser model',BROWSER_PROFILES[0].id);
  await card.locator('summary').filter({hasText:'Model settings'}).click();
  await card.getByLabel('Context tokens',{exact:true}).fill('8192');
  await card.getByLabel('Maximum output tokens',{exact:true}).fill('256');
  await card.getByRole('button',{name:'Save model settings',exact:true}).click();
  await expect(card.getByRole('status')).toContainText('Settings saved');
  await page.reload();await expect(page.getByRole('status',{name:'Persistence status'})).toHaveText('All changes saved');
  // The AI pane remembers its open state; Connections is per-instance UI.
  if(!await page.getByRole('button',{name:'AI connections',exact:true}).isVisible()) await page.getByRole('button',{name:'AI chat',exact:true}).click();
  await page.getByRole('button',{name:'AI connections',exact:true}).click();
  const restored=page.getByRole('region',{name:'Browser models',exact:true});
  await restored.locator('summary').filter({hasText:'Model settings'}).click();
  await expect(restored.getByLabel('Context tokens',{exact:true})).toHaveValue('8192');
  await expect(restored.getByLabel('Maximum output tokens',{exact:true})).toHaveValue('256');
  await restored.locator('summary').filter({hasText:'Model settings'}).click();
  await restored.locator('summary').filter({hasText:'Browser compatibility'}).click();
  await restored.getByRole('button',{name:'Check this browser',exact:true}).click();
  await expect(restored.getByRole('button',{name:'Check this browser',exact:true})).toBeEnabled({timeout:25000});
  await expect(restored).toContainText('Installed driver');
  assert.equal(this.requests.filter(request=>/huggingface\.co|browser-models\/wllama/.test(request.url)).length,0);
  await fixture(page);
  const facts=await page.evaluate(()=>browserModelsFixture.probeBrowser());
  await mkdir(this.artifactDirectory,{recursive:true});
  await writeFile(`${this.artifactDirectory}/browser-inference-capabilities.json`,JSON.stringify(facts,null,2));
  await page.setViewportSize({width:1280,height:1600});
  await restored.screenshot({path:`${this.artifactDirectory}/browser-model-compatibility.png`});
  await page.setViewportSize({width:320,height:1800});
  const compactCompatibility=restored.locator('details.disclosure').filter({has:page.locator('summary').filter({hasText:'Browser compatibility'})});
  if(!await compactCompatibility.evaluate(element=>element.open)) await compactCompatibility.locator(':scope > summary').click();
  await restored.getByRole('button',{name:'Check this browser',exact:true}).click();
  await expect(restored.getByRole('button',{name:'Check this browser',exact:true})).toBeEnabled({timeout:25000});
  await restored.screenshot({path:`${this.artifactDirectory}/browser-model-compatibility-compact.png`});
  await compactCompatibility.locator(':scope > summary').click();
  await restored.locator('summary').filter({hasText:'Model and runtime pins'}).click();
  await restored.screenshot({path:`${this.artifactDirectory}/browser-model-pins-compact.png`});
  await page.setViewportSize({width:1280,height:1800});
  const pins=restored.locator('details.disclosure').filter({has:page.locator('summary').filter({hasText:'Model and runtime pins'})});
  if(!await pins.evaluate(element=>element.open)) await pins.locator(':scope > summary').click();
  await restored.screenshot({path:`${this.artifactDirectory}/browser-model-pins.png`});
});
Then('cancelling a browser model installation removes its unfinished byte ranges',async function(){
  const page=this.page;let release;
  const held=new Promise(resolve=>release=resolve);let requests=0;
  await this.context.route('https://huggingface.co/**',async route=>{
    requests++;
    if(requests===1) {
      await route.fulfill({status:206,headers:{'content-range':`bytes 0-8388607/${BROWSER_PROFILES[0].weight_bytes}`,'content-type':'application/octet-stream','access-control-allow-origin':'*','access-control-expose-headers':'Content-Range, Content-Length'},body:Buffer.alloc(8388608)});
    } else {await held;await route.abort().catch(()=>{});}
  });
  try {
    const card=await controls(page);
    await card.getByRole('button',{name:`Install ${BROWSER_PROFILES[0].title}`,exact:true}).click();
    await expect(card.getByRole('progressbar',{name:'Model installation'})).toBeVisible();
    await mkdir(this.artifactDirectory,{recursive:true});
    await card.screenshot({path:`${this.artifactDirectory}/browser-model-download.png`});
    await card.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(card.getByRole('button',{name:`Install ${BROWSER_PROFILES[0].title}`,exact:true})).toBeEnabled();
    await fixture(page);
    const state=await page.evaluate(async()=>{const db=await browserModelsFixture.modelDatabase();try{return {models:await db.count('models'),artifacts:await db.count('artifacts'),blocks:await db.count('blocks')};}finally{db.close();}});
    assert.deepEqual(state,{models:0,artifacts:0,blocks:0});
    await expect(page.getByRole('status',{name:'Persistence status'})).toHaveText('All changes saved');
  } finally {release();}
});
Then('the browser model store verifies bounded ranges and serves local cross-chunk reads offline',async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,bytes=new Uint8Array(m.BLOCK_BYTES+137);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const file={id:'test-weights',url:'https://huggingface.co/test/resolve/pin/file.gguf',bytes:bytes.length,sha256,kind:'weights'};
    const ranges=[];let progress=0;
    await m.installArtifact(file,received=>progress=received,new AbortController().signal,async(url,options)=>{
      const range=options.headers.Range.match(/bytes=(\d+)-(\d+)/);const start=+range[1],end=+range[2];ranges.push([start,end]);
      return new Response(bytes.slice(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${bytes.length}`}});
    });
    const local=m.installedFetch([file]);
    const response=await local(file.url,{headers:{Range:`bytes=${m.BLOCK_BYTES-12}-${m.BLOCK_BYTES+12}`}});
    const actual=new Uint8Array(await response.arrayBuffer());
    const expected=bytes.slice(m.BLOCK_BYTES-12,m.BLOCK_BYTES+13);
    let unknown=false;try{await local('https://untrusted.invalid/weights');}catch{unknown=true;}
    const db=await m.modelDatabase();const blocks=await db.count('blocks');db.close();
    return {ranges,progress,size:bytes.length,blocks,equal:actual.every((v,i)=>v===expected[i]),unknown,status:response.status,header:(await local(file.url,{method:'HEAD'})).headers.get('accept-ranges')};
  });
  assert.deepEqual(result.ranges,[[0,8388607],[8388608,result.size-1]]);assert.equal(result.progress,result.size);assert.equal(result.blocks,2);assert.equal(result.equal,true);assert.equal(result.unknown,true);assert.equal(result.status,206);assert.equal(result.header,'bytes');
});
Then('browser model storage rejects corrupt oversized and incomplete ranges',async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,errors=[];
    for(const [index,mode] of ['checksum','oversized','truncated','full-response','wrong-range'].entries()){
      const file={id:mode,url:'https://huggingface.co/fixture',bytes:16,sha256:(index+1).toString(16).padStart(64,'0'),kind:'weights'};
      try {await m.installArtifact(file,()=>{},new AbortController().signal,async()=>new Response(new Uint8Array(mode==='oversized'?17:mode==='truncated'?15:16),{status:mode==='full-response'?200:206,headers:{'content-range':mode==='wrong-range'?'bytes 0-14/16':'bytes 0-15/16'}}));}
      catch(error){errors.push(error.message);}
    }
    const db=await m.modelDatabase();try{return {errors,artifacts:await db.count('artifacts'),blocks:await db.count('blocks')};}finally{db.close();}
  });
  assert.equal(result.errors.length,5);assert.match(result.errors[0],/Checksum/);assert.match(result.errors[1],/exceeded/);assert.match(result.errors[2],/before/);assert.equal(result.artifacts,0);assert.equal(result.blocks,0);
});
Then('browser model storage serves a large native tensor slice from bounded local blocks',{timeout:60000},async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,size=129*1024*1024,hash='native-tensor-fixture',db=await m.modelDatabase();
    const block=new Uint8Array(m.BLOCK_BYTES);block.fill(93);
    // Installation integrity is covered separately; prepare a complete local
    // corpus here so the native reader's large-slice contract is isolated.
    for(let offset=0;offset<size;offset+=block.length) await db.put('blocks',block.slice(0,Math.min(block.length,size-offset)).buffer,[hash,offset/block.length]);
    await db.put('artifacts',{sha256:hash,bytes:size});db.close();
    const bytes=new Uint8Array(await m.readArtifact({id:hash,url:'https://offline.invalid/fixture.gguf',bytes:size,sha256:hash,kind:'weights'},0,size));
    return {size:bytes.byteLength,first:bytes[0],last:bytes.at(-1)};
  });
  assert.deepEqual(result,{size:129*1024*1024,first:93,last:93});
  assert.equal(this.requests.filter(request=>/offline\.invalid|huggingface\.co/.test(request.url)).length,0);
});
Then('browser model removal retains shared files and refuses an active model lease',async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,profiles=m.BROWSER_PROFILES.slice(4),db=await m.modelDatabase();
    for(const p of profiles){const files=m.artifactsFor(p);for(const f of files)await db.put('artifacts',{sha256:f.sha256,bytes:f.bytes});await db.put('models',{id:p.id,hashes:files.map(f=>f.sha256),installedAt:Date.now()});}
    let release,entered;const ready=new Promise(resolve=>entered=resolve);const held=new Promise(resolve=>release=resolve);
    const lock=navigator.locks.request(`code-browser-model-use:${profiles[0].id}`,async()=>{entered();await held;});await ready;
    let blocked=false;try{await m.removeModel(profiles[0].id);}catch{blocked=true;}release();await lock;
    await m.removeModel(profiles[0].id);const retained=await db.getAllKeys('artifacts');
    const kept=m.artifactsFor(profiles[1]).every(file=>retained.includes(file.sha256));
    await m.removeModel(profiles[1].id);const remaining=await db.count('artifacts');db.close();return {blocked,kept,remaining};
  });
  assert.deepEqual(result,{blocked:true,kept:true,remaining:0});
});
Then('browser images are bounded resized and replayed through both native Pi adapters',async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,c=document.createElement('canvas');c.width=800;c.height=400;c.getContext('2d').fillStyle='red';c.getContext('2d').fillRect(0,0,800,400);
    const file=new File([await new Promise(resolve=>c.toBlob(resolve,'image/png'))],'image.png',{type:'image/png'});
    const image=await m.prepareImage(file,65536);const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(image.data),c=>c.charCodeAt(0))],{type:image.mimeType}));
    const size=[bitmap.width,bitmap.height];bitmap.close();
    const outputs=[];
    for(const kind of ['webml','wllama']){
      let seen;
      const native={kind,async generate(messages){seen=messages;return {message:{content:'Image received'},usage:{prompt_tokens:4,completion_tokens:2},finish_reason:'stop'};}};
      const plugin={model:(id,contextWindow)=>({id,name:id,provider:'browser',api:'openai-completions',baseUrl:'',input:['text','image'],reasoning:false,contextWindow,maxTokens:128,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}),stream:m.localStream(native,{maxTokens:128,responseTimeoutMs:5000,generation:{}},[])};
      await new m.BrowserAgentHarness().run(plugin,'fixture',[{role:'user',content:'Look',images:[image]}],new AbortController().signal,()=>{},{instructions:'Describe.',contextWindow:4096,tools:[],onTool(){},onUsage(){}});
      const part=seen.at(-1).content.find(p=>p.type==='image');outputs.push(kind==='webml'?{kind,width:part.image.width,channels:part.image.channels,red:part.image.data[0]}:{kind,bytes:part.data.byteLength});
    }
    let rejected=false;try{await m.prepareImage(new File(['x'],'bad.txt',{type:'text/plain'}),65536);}catch{rejected=true;}
    return {size,outputs,rejected};
  });
  assert.ok(result.size[0]*result.size[1]<=65536);assert.ok(Math.abs(result.size[0]/result.size[1]-2)<.02);
  assert.equal(result.outputs[0].channels,4);assert.equal(result.outputs[0].red,255);assert.ok(result.outputs[1].bytes>0);assert.equal(result.rejected,true);
});
Then('browser conversations discover installed models and retain image attachments only in their own draft',async function(){
  const page=this.page;
  // Only installation metadata is needed for discovery. No generation is requested.
  await fixture(page);
  await page.evaluate(async()=>{
    const m=browserModelsFixture,profile=m.BROWSER_PROFILES[0],db=await m.modelDatabase();
    await db.put('models',{id:profile.id,hashes:m.artifactsFor(profile).map(file=>file.sha256),installedAt:Date.now()});db.close();
  });
  await controls(page);
  await page.getByRole('button',{name:'Use Browser models',exact:true}).click();
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await expect(page.getByRole('button',{name:'AI model',exact:true})).toContainText(BROWSER_PROFILES[0].title);
  const png=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=20;canvas.height=10;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,20,10);return canvas.toDataURL('image/png').split(',')[1];});
  await page.getByLabel('Attach image',{exact:true}).setInputFiles({name:'red.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await expect(page.getByRole('img',{name:'Ready to send',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Message AI',exact:true}).fill('Describe the attached image.');
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await expect(page.getByRole('img',{name:'Ready to send',exact:true})).toHaveCount(0);
  await page.getByRole('tab',{name:'Session 1',exact:true}).click();
  await expect(page.getByRole('img',{name:'Ready to send',exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toHaveText('Describe the attached image.');
  await page.getByRole('button',{name:'Remove image',exact:true}).click();
  await expect(page.getByRole('img',{name:'Ready to send',exact:true})).toHaveCount(0);
  assert.equal(this.requests.filter(request=>/huggingface\.co/.test(request.url)).length,0);
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/browser-model-composer.png`});
});
Then('browser conversations keep the missing model notice visible and follow installation changes across tabs',async function(){
  const page=this.page;
  await controls(page);
  await page.getByRole('button',{name:'Use Browser models',exact:true}).click();
  const notice=page.getByRole('status',{name:'Browser model installation',exact:true});
  await expect(notice.locator('p')).toHaveText('Install a model in Connections → Browser models, then connect again.');
  await expect(notice).toBeVisible();
  const bounds=await notice.evaluate(element=>({notice:element.getBoundingClientRect().toJSON(),setup:element.nextElementSibling.getBoundingClientRect().toJSON(),panel:element.parentElement.getBoundingClientRect().toJSON()}));
  assert.ok(Math.abs(bounds.notice.bottom-bounds.setup.top)<=1);
  assert.ok(Math.abs(bounds.setup.bottom-bounds.panel.bottom)<=1);
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.mouse.move(0,0);
  await expect(notice).toBeVisible();
  await expect(page.getByRole('img',{name:'AI interruption',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await expect(notice).toBeVisible();
  await page.getByRole('button',{name:'AI connections',exact:true}).click();
  await page.getByRole('button',{name:'Use Local Ollama',exact:true}).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole('tab',{name:'Session 1',exact:true}).click();
  await expect(notice).toBeVisible();
  const sibling=await this.context.newPage();
  try {
    await sibling.goto(page.url());await fixture(sibling);
    // Model metadata is sufficient for discovery; this test never requests generation or weights.
    await sibling.evaluate(async()=>{
      const m=browserModelsFixture,profile=m.BROWSER_PROFILES[0],db=await m.modelDatabase();
      try {await db.put('models',{id:profile.id,hashes:m.artifactsFor(profile).map(file=>file.sha256),installedAt:Date.now()});} finally {db.close();}
      const channel=new BroadcastChannel('code-browser-models');channel.postMessage('changed');channel.close();
    });
    await expect(notice).toHaveCount(0);
    await sibling.evaluate(async()=>{const m=browserModelsFixture,unsubscribe=m.subscribeModels(()=>{});try {await m.removeModel(m.BROWSER_PROFILES[0].id);} finally {unsubscribe();}});
    await expect(notice).toBeVisible();
  } finally {await sibling.close();}
  assert.equal(this.requests.filter(request=>/huggingface\.co/.test(request.url)).length,0);
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/browser-model-notice.png`});
});
