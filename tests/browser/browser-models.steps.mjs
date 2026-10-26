// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { rolldown } from 'rolldown';
import { mkdir, writeFile } from 'node:fs/promises';
import { BROWSER_PROFILES } from '../../src/lib/assistant/browser/catalog.ts';
import { selectDropdown, selectPage, addOllamaConnection } from './navigation.helpers.mjs';
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
  await selectPage(page,'Settings','AI');
  return page.getByRole('region',{name:'AI connections',exact:true}).getByRole('region',{name:BROWSER_PROFILES[0].title,exact:true});
}
// A section with an accessible name has a region role, so scopes match the UI.
Then('browser model menus expose the full catalog before any model is installed',async function(){
  const page=this.page;await page.getByRole('button',{name:'AI chat',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'AI model',exact:true}).click();
  const menu=page.getByRole('menu',{name:'AI model',exact:true});
  expect(await menu.getByRole('menuitemradio').evaluateAll(items=>items.map(item=>item.dataset.value))).toEqual(BROWSER_PROFILES.map(profile=>profile.id));
  await expect(menu.getByText(/Install ·/)).toHaveCount(BROWSER_PROFILES.length);
  await page.keyboard.press('Escape');
  await page.getByRole('textbox',{name:'Message AI',exact:true}).fill('Keep my browser draft.');
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Session 1',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toHaveText('Keep my browser draft.');
  assert.equal(this.requests.filter(request=>/huggingface\.co|localhost:11434|api\.openai\.com/.test(request.url)).length,0);
});
Then('selecting a browser model starts its preparation and can be cancelled without losing the draft',{timeout:60000},async function(){
  const page=this.page;let release,requests=0;
  const held=new Promise(resolve=>release=resolve);
  await this.context.route('https://huggingface.co/**',async route=>{requests++;await held;await route.abort().catch(()=>{});});
  try{
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByRole('button',{name:'AI chat',exact:true}).click();
    const prompt=page.getByRole('textbox',{name:'Message AI',exact:true}),model=page.getByRole('button',{name:'AI model',exact:true});
    const context=page.getByRole('button',{name:'Model context limit',exact:true});
    assert.equal(await context.getAttribute('title'),null);
    await context.hover();
    const emptyHint=page.getByRole('tooltip').filter({hasText:'Choose an LLM to set its context limit.'});
    await expect(emptyHint).toBeVisible();await expect(emptyHint).toHaveClass(/app-tooltip/);
    await context.click();
    const budget=page.getByRole('dialog',{name:'Context budget',exact:true}),slider=budget.getByRole('slider',{name:'Model context limit',exact:true});
    await expect(slider).toBeDisabled();await page.keyboard.press('Escape');await expect(budget).toBeHidden();
    await prompt.fill('Draft survives model loading.');
    for(let attempt=1;attempt<=2;attempt++){
      await model.click();await page.getByRole('menu',{name:'AI model',exact:true}).locator(`[data-value="${BROWSER_PROFILES[0].id}"]`).click();
      await expect.poll(()=>requests).toBe(attempt);
      await expect(page.getByRole('button',{name:'Cancel model loading',exact:true})).toHaveCount(0);
      const bar=page.getByRole('progressbar',{name:'Model loading',exact:true});await expect(bar).toBeVisible();
      await expect(bar).toHaveAttribute('data-indeterminate','true');
      const fill=bar.locator('span'),transform=await fill.evaluate(node=>getComputedStyle(node).transform);
      await expect.poll(()=>fill.evaluate(node=>getComputedStyle(node).transform)).not.toBe(transform);
      if(attempt===2){await page.emulateMedia({reducedMotion:'reduce'});await expect(fill).toHaveCSS('animation-name','none');}
      await page.getByRole('button',{name:'Close AI',exact:true}).click();
      await page.getByRole('button',{name:'AI chat',exact:true}).click();
      await expect(page.locator('.model-loading')).toHaveCount(0);await expect(model).toBeEnabled();
      await expect(prompt).toHaveText('Draft survives model loading.');
      await context.hover();
      const configuredHint=page.getByRole('tooltip').filter({hasText:'Configured model context:'});
      await expect(configuredHint).toBeVisible();await expect(configuredHint).not.toContainText('undefined');
      await context.click();await expect(slider).toBeEnabled();await expect(slider).toHaveAttribute('aria-orientation','vertical');
      const bounds=await slider.boundingBox(),anchor=await context.boundingBox(),popup=await budget.boundingBox();
      assert.ok(bounds.height>bounds.width*3);assert.ok(popup.y+popup.height<=anchor.y+2);
      await slider.click({position:{x:bounds.width/2,y:bounds.height/2}});await expect(slider).toHaveValue('3072');
      if(attempt===1){await mkdir(this.artifactDirectory,{recursive:true});await budget.screenshot({path:`${this.artifactDirectory}/context-slider.png`});}
      await slider.press('Home');await expect(slider).toHaveValue('2048');
      await slider.press('ArrowUp');await expect(slider).toHaveValue('3072');
      await slider.press('End');await expect(slider).toHaveValue('4096');
      await slider.press('ArrowDown');await expect(slider).toHaveValue('3072');
      if(attempt===1)await slider.press('Escape');else await prompt.click();
      await expect(budget).toBeHidden();await expect(context).toContainText('3.1k');await expect(prompt).toBeVisible();
    }
  }finally{release();}
});
Then('new AI sessions default to the browser composer and retain explicit session choices',async function(){
  const page=this.page,toggle=page.getByRole('button',{name:'AI chat',exact:true});await toggle.click();
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toBeVisible();
  await selectPage(page,'Settings','AI');
  await expect(page.getByRole('button',{name:'Use Local Ollama',exact:true})).toHaveCount(0);
  await addOllamaConnection(page);
  const connection=page.getByRole('button',{name:'AI connection',exact:true}),id=await connection.getAttribute('data-value');
  await toggle.click();await toggle.click();await expect(connection).toHaveAttribute('data-value',id);
  await page.getByRole('button',{name:'New chat',exact:true}).click();await expect(connection).toHaveAttribute('data-value',id);
  const tabs=page.getByRole('tablist',{name:'AI conversations',exact:true});
  await tabs.getByRole('tab',{selected:true}).press('Delete');await tabs.getByRole('tab',{selected:true}).press('Delete');
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Connect',exact:true})).toHaveCount(0);
  await page.reload({waitUntil:'networkidle'});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toBeVisible();
  assert.equal(this.requests.filter(request=>/localhost:11434|api\.openai\.com|huggingface\.co/.test(request.url)).length,0);
});
Then('an existing local Ollama profile is preserved without becoming a protected default',async function(){
  const page=this.page;
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('code-ai-connections',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('connections',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    try {
      const tx=db.transaction('connections','readwrite');
      tx.objectStore('connections').put({id:'local-ollama',label:'Saved Ollama',provider:'ollama',address:'http://localhost:11434',credentialId:''});
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    }finally{db.close();}
  });
  await selectPage(page,'Settings','AI');
  await page.getByRole('button',{name:'Edit Saved Ollama',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Remote inference connection',exact:true});
  await expect(dialog.getByRole('textbox',{name:'Connection name',exact:true})).toHaveValue('Saved Ollama');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.reload({waitUntil:'networkidle'});await selectPage(page,'Settings','AI');
  await expect(page.getByRole('button',{name:'Use Saved Ollama',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Remove Saved Ollama',exact:true}).click();
  await expect(page.getByRole('button',{name:'Use Saved Ollama',exact:true})).toHaveCount(0);
  await page.reload({waitUntil:'networkidle'});await selectPage(page,'Settings','AI');
  await expect(page.getByRole('button',{name:/^Use /})).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Use WebML',exact:true})).toBeVisible();
});
Then('browser model controls expose six pinned profiles and retain generation settings without downloading weights',{timeout:60000},async function(){
  const page=this.page;const card=await controls(page);await fixture(page);
  const savedSettings=id=>page.evaluate(id=>browserModelsFixture.readModelSettings(id),id);
  await expect(page.getByRole('region',{name:'LLM',exact:true}).locator('[data-model-id]')).toHaveCount(BROWSER_PROFILES.length);
  for(const profile of BROWSER_PROFILES) {
    const card=page.getByRole('region',{name:profile.title,exact:true});
    await expect(card).toBeVisible();
    await expect(card.locator('.model-name')).toHaveText(profile.title.split(' · ')[0]);
    await expect(card.getByRole('button',{name:'Model settings',exact:true})).toHaveAttribute('aria-expanded','false');
    await expect(card.getByRole('button',{name:'Detailed info',exact:true})).toHaveAttribute('aria-expanded','false');
    await expect(card.getByRole('button',{name:'Browser compatibility',exact:true})).toHaveAttribute('aria-expanded','false');
    await expect(card.getByLabel('Model limitations',{exact:true})).toBeHidden();
    await expect(card.getByRole('button',{name:`Install ${profile.title}`,exact:true})).toBeEnabled();
  }
  await card.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(card.getByRole('button',{name:'Save model settings',exact:true})).toHaveCount(0);
  await card.getByLabel('Context tokens',{exact:true}).fill('8192');
  await card.getByLabel('Maximum output tokens',{exact:true}).fill('256');
  await expect.poll(()=>savedSettings(BROWSER_PROFILES[0].id)).toMatchObject({generation:{context_tokens:8192,max_new_tokens:256}});
  await card.getByLabel('Context tokens',{exact:true}).fill('1');
  await expect(card.getByRole('alert')).toContainText('context_tokens');
  expect((await savedSettings(BROWSER_PROFILES[0].id)).generation.context_tokens).toBe(8192);
  await card.getByLabel('Context tokens',{exact:true}).fill('8192');
  await expect(card.getByRole('alert')).toHaveCount(0);
  const second=page.getByRole('region',{name:BROWSER_PROFILES[1].title,exact:true});
  await second.getByRole('button',{name:'Model settings',exact:true}).click();
  await second.getByLabel('Context tokens',{exact:true}).fill('4096');
  await expect.poll(()=>savedSettings(BROWSER_PROFILES[1].id)).toMatchObject({generation:{context_tokens:4096}});
  const wllama=page.getByRole('region',{name:BROWSER_PROFILES[4].title,exact:true});
  await wllama.getByRole('button',{name:'Model settings',exact:true}).click();
  await selectDropdown(page,'Browser execution','hybrid');
  await wllama.getByLabel('GPU layer budget',{exact:true}).fill('12');
  await wllama.getByLabel('Vision on GPU in hybrid mode',{exact:true}).uncheck();
  await wllama.getByLabel('Flash attention',{exact:true}).uncheck();
  await selectDropdown(page,'Key cache','q8_0');
  await expect.poll(()=>savedSettings(BROWSER_PROFILES[4].id)).toMatchObject({execution:{mode:'hybrid',gpuLayers:12,visionGpu:false},generation:{flash_attention:false,cache_type_k:'q8_0'}});
  await page.reload();await expect(page.getByRole('status',{name:'Persistence status'})).toHaveText('All changes saved');
  await selectPage(page,'Settings','AI');
  const restored=page.getByRole('region',{name:BROWSER_PROFILES[0].title,exact:true});
  await restored.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(restored.getByLabel('Context tokens',{exact:true})).toHaveValue('8192');
  await expect(restored.getByLabel('Maximum output tokens',{exact:true})).toHaveValue('256');
  await second.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(second.getByLabel('Context tokens',{exact:true})).toHaveValue('4096');
  await second.getByRole('button',{name:'Model settings',exact:true}).click();
  await wllama.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(wllama.getByRole('button',{name:'Browser execution',exact:true})).toHaveAttribute('data-value','hybrid');
  await expect(wllama.getByLabel('GPU layer budget',{exact:true})).toHaveValue('12');
  await expect(wllama.getByLabel('Vision on GPU in hybrid mode',{exact:true})).not.toBeChecked();
  await expect(wllama.getByLabel('Flash attention',{exact:true})).not.toBeChecked();
  await expect(wllama.getByRole('button',{name:'Key cache',exact:true})).toHaveAttribute('data-value','q8_0');
  await wllama.getByRole('button',{name:'Model settings',exact:true}).click();
  await restored.getByRole('button',{name:'Model settings',exact:true}).click();
  await restored.getByRole('button',{name:'Browser compatibility',exact:true}).click();
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
  const compactCompatibility=restored.getByRole('button',{name:'Browser compatibility',exact:true});
  if(await compactCompatibility.getAttribute('aria-expanded')!=='true') await compactCompatibility.click();
  await restored.getByRole('button',{name:'Check this browser',exact:true}).click();
  await expect(restored.getByRole('button',{name:'Check this browser',exact:true})).toBeEnabled({timeout:25000});
  await restored.screenshot({path:`${this.artifactDirectory}/browser-model-compatibility-compact.png`});
  await compactCompatibility.click();
  await restored.getByRole('button',{name:'Detailed info',exact:true}).click();
  await restored.screenshot({path:`${this.artifactDirectory}/browser-model-pins-compact.png`});
  await page.setViewportSize({width:1280,height:1800});
  const pins=restored.getByRole('region',{name:'Detailed info',exact:true});
  await expect(pins.getByLabel('Model limitations',{exact:true})).toBeVisible();
  await expect(pins).toContainText(BROWSER_PROFILES[0].limitations);
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
    const bar=card.getByRole('progressbar',{name:'Model installation',exact:true});
    await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);
    await expect(bar).toHaveAttribute('data-indeterminate','false');
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
    const m=browserModelsFixture,profiles=m.BROWSER_PROFILES.slice(4,6),db=await m.modelDatabase();
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
  await page.getByRole('button',{name:'Use WebML',exact:true}).click();
  await selectDropdown(page,'AI model',BROWSER_PROFILES[0].id);
  await expect(page.getByRole('button',{name:'AI model',exact:true})).toBeEnabled();
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
Then('browser model availability follows installation changes without hiding the composer',async function(){
  const page=this.page;await page.getByRole('button',{name:'AI chat',exact:true}).click();await fixture(page);
  await page.getByRole('button',{name:'AI model',exact:true}).click();const menu=page.getByRole('menu',{name:'AI model',exact:true});
  const item=menu.locator(`[data-value="${BROWSER_PROFILES[0].id}"]`);await expect(item).toContainText('Install ·');
  await page.evaluate(async()=>{
    const m=browserModelsFixture,p=m.BROWSER_PROFILES[0],db=await m.modelDatabase();try{await db.put('models',{id:p.id,hashes:m.artifactsFor(p).map(file=>file.sha256),installedAt:Date.now()});}finally{db.close();}
    const channel=new BroadcastChannel('code-browser-models');channel.postMessage('changed');channel.close();
  });
  await expect(item).toContainText('Installed');await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox',{name:'Message AI',exact:true})).toBeVisible();
  assert.equal(this.requests.filter(request=>/huggingface\.co/.test(request.url)).length,0);
});

Then('AI settings offer Gemma MiniCPM LFM vision and the nine decision profiles separately',async function(){
  const page=this.page;await controls(page);
  await expect(page.getByRole('region',{name:'LLM',exact:true}).locator('[data-model-id]')).toHaveCount(8);
  await expect(page.getByRole('region',{name:'Vision',exact:true}).locator('[data-model-id]')).toHaveCount(1);
  await expect(page.getByRole('region',{name:'Decision models',exact:true}).locator('[data-model-id]')).toHaveCount(9);
  await expect(page.getByRole('button',{name:'Use LiteRT-LM',exact:true})).toBeVisible();
  const gemma=page.getByRole('region',{name:'Gemma 4 · E2B',exact:true});await gemma.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(gemma.getByText(/GPU inference/)).toBeVisible();await expect(gemma.getByLabel('Context tokens',{exact:true})).toHaveValue('4096');
  await expect(gemma.getByLabel('Reasoning',{exact:true})).toHaveCount(0);
  const mini=page.getByRole('region',{name:'MiniCPM5 · 2.52B · Q4',exact:true});await mini.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(mini.getByLabel('GPU layer budget',{exact:true})).toHaveValue('8');await expect(mini.getByText('Vision on GPU in hybrid mode',{exact:true})).toHaveCount(0);
  expect(this.requests.filter(request=>/huggingface\.co/.test(request.url))).toHaveLength(0);
});
Then('split browser runtime assets verify and stream from installed blocks offline',async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,bytes=new Uint8Array(8388608+31);bytes.set([11,22,33],8388607);
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const file={id:'split-fixture',url:'https://offline.invalid/split',bytes:bytes.length,sha256,kind:'runtime',parts:[{url:'https://offline.invalid/part-1',bytes:8388608},{url:'https://offline.invalid/part-2',bytes:31}]},requests=[];
    await m.installArtifact(file,()=>{},new AbortController().signal,async url=>{requests.push(String(url));return new Response(bytes.slice(String(url).endsWith('part-1')?0:8388608,String(url).endsWith('part-1')?8388608:bytes.length));});
    const response=await m.installedFetch([file])(file.url,{headers:{range:'bytes=8388607-8388609'}});
    return {requests,bytes:[...new Uint8Array(await response.arrayBuffer())]};
  });
  assert.deepEqual(result,{requests:['https://offline.invalid/part-1','https://offline.invalid/part-2'],bytes:[11,22,33]});
});
Then('the installed LiteRT loader initializes native Wasm using only verified Blob URLs',{timeout:60000},async function(){
  const {rolldown}=await import('rolldown'),{resolve}=await import('node:path'),{readFile}=await import('node:fs/promises'),{installedLiteRT,createModelRuntimes}=await import('../../build/model-runtimes.mjs');
  const feature=JSON.stringify(resolve('node_modules/@litert-lm/core/dist/wasm_feature_detect.js'));
  const entry=`import {loadLiteRtLm} from '@litert-lm/core'; import {supportsFeature} from ${feature};
    let names; self.onmessage=async({data})=>{try{if(data.type==='features'){const relaxed=await supportsFeature('relaxedSimd'),jspi=await supportsFeature('jspi');const stem='litertlm_wasm'+(relaxed?'':'_compat')+(jspi?'':'_asyncify')+'_internal';self.postMessage({files:[stem+'.js',stem+'.wasm']});return;}
    const seen=[]; globalThis.__codeRuntimeURL=name=>{seen.push(name);if(!data.urls[name])throw Error('Unpinned runtime');return data.urls[name];};
    const nativeFetch=self.fetch.bind(self);self.fetch=(url,options)=>{if(!Object.values(data.urls).includes(String(url)))throw Error('Network fallback blocked');return nativeFetch(url,options);};
    await loadLiteRtLm('https://installed.invalid/runtime/');self.postMessage({ok:true,seen});}catch(error){self.postMessage({ok:false,error:error.stack});}};`;
  const bundle=await rolldown({input:'litert-probe',platform:'browser',plugins:[{name:'probe',resolveId(id){if(id==='litert-probe')return '\0litert-probe';},async load(id){if(id==='\0litert-probe')return entry;if(id===resolve('node_modules/@litert-lm/core/dist/load.js'))return installedLiteRT(await readFile(id));}}]});
  let code;try{code=(await bundle.generate({format:'iife',codeSplitting:false})).output.find(item=>item.type==='chunk').code;}finally{await bundle.close();}
  const {catalog}=await createModelRuntimes();
  const result=await this.page.evaluate(async({code,files})=>{
    const urls=[],url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));urls.push(url);const worker=new Worker(url);
    try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native Wasm initialization timed out')),45000);
      worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};
      worker.onmessage=async({data})=>{try{if(data.files){const installed={};for(const id of data.files){const file=files.find(file=>file.id===id),parts=[];for(const part of file.parts??[{url:file.url}])parts.push(await(await fetch('/'+part.url)).arrayBuffer());const bytes=await new Blob(parts).arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==file.sha256)throw Error('Runtime checksum mismatch: '+id+' ('+bytes.byteLength+' bytes, '+hash+', expected '+file.sha256+')');installed[id]=URL.createObjectURL(new Blob([bytes],{type:id.endsWith('.wasm')?'application/wasm':'text/javascript'}));urls.push(installed[id]);}worker.postMessage({urls:installed});}else{clearTimeout(timer);resolve(data);}}catch(error){clearTimeout(timer);reject(error);}};
      worker.postMessage({type:'features'});
    });}finally{worker.terminate();for(const url of urls)URL.revokeObjectURL(url);}
  },{code,files:catalog.litert});
  assert.equal(result.ok,true,result.error);assert.equal(result.seen.length,2);assert.ok(result.seen[0].endsWith('.js'));assert.ok(result.seen[1].endsWith('.wasm'));
});

Then('a Gemma conversation accepts a local image without requiring native multimodal settings',async function(){
  const page=this.page;await page.route('https://huggingface.co/**',route=>route.abort());
  await page.getByRole('button',{name:'AI chat',exact:true}).click();await page.getByRole('button',{name:'AI model',exact:true}).click();
  await page.getByRole('menu',{name:'AI model',exact:true}).locator('[data-value="kg-browser-assistant-gemma4-e2b"]').click();
  await expect(page.getByRole('button',{name:'AI model',exact:true})).toContainText('Gemma 4');
  const attach=page.getByRole('button',{name:'Attach image',exact:true});await expect(attach).toBeEnabled();
  const sharp=(await import('sharp')).default,png=await sharp({create:{width:80,height:40,channels:3,background:'#ffffff'}}).png().toBuffer();
  await page.locator('input[type="file"][aria-label="Attach image"]').setInputFiles({name:'local-image.png',mimeType:'image/png',buffer:png});
  await expect(page.getByRole('img',{name:'Ready to send',exact:true})).toBeVisible();
  await expect(page.getByRole('alert').filter({hasText:/Unknown engine|image decoding/i})).toHaveCount(0);
});

Then('browser model downloads recover from a broken stream and transient server error',async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,bytes=Uint8Array.from({length:16},(_,i)=>i),progress=[];let calls=0;
    const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const file={id:'network-retry',url:'https://offline.invalid/retry',bytes:16,sha256,kind:'weights'};
    await m.installArtifact(file,value=>progress.push(value),new AbortController().signal,async()=>{
      calls++;if(calls===2)return new Response(null,{status:503});
      const body=calls===1?new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,8));},pull(controller){controller.error(new TypeError('Connection reset'));}}):bytes;
      return new Response(body,{status:206,headers:{'content-range':'bytes 0-15/16'}});
    });
    const stored=[...new Uint8Array(await m.readArtifact(file))];return {calls,stored,progress};
  });
  assert.equal(result.calls,3);assert.deepEqual(result.stored,Array.from({length:16},(_,i)=>i));assert.ok(result.progress.includes(8));assert.equal(result.progress.at(-1),16);
});
Then('browser model retries are bounded and cancellation interrupts their backoff',async function(){
  await fixture(this.page);
  const result=await this.page.evaluate(async()=>{
    const m=browserModelsFixture,failures=[];let calls=0;
    for(const cancel of [false,true]){
      const controller=new AbortController(),file={id:'bounded-retry',url:'https://offline.invalid/retry',bytes:16,sha256:String(cancel?'b':'a').repeat(64),kind:'weights'};const start=calls;
      try{await m.installArtifact(file,()=>{if(cancel)controller.abort();},controller.signal,async()=>{calls++;throw new TypeError('Network failure');});}catch(error){failures.push({cancel,calls:calls-start,name:error.name});}
    }
    const db=await m.modelDatabase();try{return {failures,artifacts:await db.count('artifacts'),blocks:await db.count('blocks')};}finally{db.close();}
  });
  assert.deepEqual(result,{failures:[{cancel:false,calls:3,name:'TypeError'},{cancel:true,calls:1,name:'AbortError'}],artifacts:0,blocks:0});
});
