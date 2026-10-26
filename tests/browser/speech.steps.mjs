// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fakeAI, openComposer, openSpeechSettings, speechBrowserFixture, cacheSpeechModels } from '../speech/browser-harness.mjs';
import { selectPage, selectDropdown } from './navigation.helpers.mjs';
Then('ONNX Runtime Web appears in Inference engines and opens speech settings', async function () {
  const page=this.page;await selectPage(page,'Settings','AI');
  const engine=page.getByRole('button',{name:'Configure ONNX Runtime Web speech inference',exact:true});
  await expect(engine).toContainText('ONNX Runtime Web');await expect(engine).toContainText('Browser · Speech');
  await engine.click();
  const card=page.getByRole('region',{name:'Speech input settings',exact:true});
  await expect(card).toBeInViewport();await expect(card.getByRole('heading',{name:'Speech input',exact:true})).toBeFocused();
});
Then('AI speech settings expose explicit precision choices and complete TEN-VAD notices', { timeout: 60000 }, async function () {
  const page=this.page,card=await openSpeechSettings(page),units=card.locator('[data-speech-mode]');
  await expect(units).toHaveCount(3);
  expect(await units.evaluateAll(rows=>rows.map(row=>row.dataset.speechMode))).toEqual(['cpu','gpu-fp16','gpu-fp32']);
  const cpu=card.locator('[data-speech-mode="cpu"]'),fp32=card.locator('[data-speech-mode="gpu-fp32"]'),fp16=card.locator('[data-speech-mode="gpu-fp16"]');
  await expect(fp32).toHaveAttribute('data-selected','true');
  for(const [unit,precision] of [[cpu,'INT8'],[fp32,'FP32'],[fp16,'FP16']]){
    await expect(unit.locator('.model-name')).toHaveText('Parakeet TDT v3');
    await expect(unit.locator('.model-parameters')).toHaveText('0.6B');
    await expect(unit.locator('.model-quantization')).toHaveText(precision);
    await expect(unit.getByRole('button',{name:'Install speech model',exact:true}).locator('.material-symbols-rounded')).toHaveText('install_desktop');
    for(const name of ['Browser compatibility','Model settings','Detailed info'])await expect(unit.getByRole('button',{name,exact:true})).toHaveAttribute('aria-expanded','false');
  }
  const sizes=await Promise.all([cpu,fp32,fp16].map(async unit=>parseFloat(await unit.locator('.model-size').textContent())));
  expect(sizes[1]).toBeGreaterThan(sizes[2]);expect(sizes[2]).toBeGreaterThan(sizes[0]);
  await cpu.getByRole('button',{name:'Model settings',exact:true}).click();
  await fp32.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(card.getByRole('radio',{name:'Use for dictation',exact:true})).toHaveCount(0);
  await cpu.getByRole('button',{name:'Model settings',exact:true}).click();
  await fp32.getByRole('button',{name:'Model settings',exact:true}).click();
  await fp16.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(fp16.getByRole('region',{name:'Model settings',exact:true})).toContainText('FP16 is experimental');
  await fp16.getByRole('button',{name:'Model settings',exact:true}).click();
  for(const unit of [cpu,fp16]){
    await unit.getByRole('button',{name:'Browser compatibility',exact:true}).click();
    await unit.getByRole('button',{name:'Check this browser',exact:true}).click();
    await expect(unit.getByRole('button',{name:'Check this browser',exact:true})).toBeEnabled({timeout:25000});
    const compatibility=unit.getByRole('region',{name:'Browser compatibility',exact:true});
    await expect(compatibility.getByText('FP16 compute',{exact:true})).toHaveCount(unit===fp16?1:0);
    await unit.getByRole('button',{name:'Browser compatibility',exact:true}).click();
  }
  await fp32.getByRole('button',{name:'Detailed info',exact:true}).click();
  await fp32.getByText('TEN-VAD · license with additional conditions',{exact:true}).click();
  await expect(fp32).toContainText("You may not Deploy the ten-vad in a way that competes with Agora");
  await expect(cpu.getByRole('button',{name:'Detailed info',exact:true})).toHaveAttribute('aria-expanded','false');
  await fp32.getByRole('button',{name:'Detailed info',exact:true}).click();
  await expect(card.getByText('Local recording diagnostics',{exact:true})).toHaveCount(0);
  await expect(card.getByRole('button',{name:'Speech processing mode',exact:true})).toHaveCount(0);
  await mkdir(this.artifactDirectory,{recursive:true});await card.screenshot({path:`${this.artifactDirectory}/speech-model-variants.png`});
  const pane=page.locator('[data-settings-panel]'),divider=page.getByRole('separator',{name:'Resize Settings pane',exact:true});
  const paneWidth=(await pane.boundingBox()).width,handle=await divider.boundingBox(),x=handle.x+handle.width/2,y=handle.y+100;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+paneWidth-320,y,{steps:3});await page.mouse.up();
  await expect.poll(async()=>Math.round((await pane.boundingBox()).width)).toBe(320);
  for(const unit of [cpu,fp32,fp16]){
    await expect(unit.locator('.model-controls')).toHaveCSS('border-top-width','1px');
    expect(await unit.evaluate(node=>node.scrollWidth-node.clientWidth)).toBeLessThanOrEqual(1);
    const bounds=await unit.boundingBox();
    for(const button of await unit.locator('.model-actions button').all()){
      const action=await button.boundingBox();expect(action.x).toBeGreaterThanOrEqual(bounds.x);expect(action.x+action.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);
    }
  }
  await fp32.getByRole('button',{name:'Model settings',exact:true}).click();
  await expect(fp32.getByRole('region',{name:'Model settings',exact:true})).toHaveCSS('border-left-width','2px');
  await card.screenshot({path:`${this.artifactDirectory}/speech-model-variants-narrow.png`});
  expect(this.requests.filter(request=>/huggingface\.co|raw\.githubusercontent\.com/.test(request.url))).toHaveLength(0);
});
Then('each Parakeet row loads and removes only its own precision variant', { timeout: 60000 }, async function () {
  const page=this.page;await cacheSpeechModels(page,['cpu','gpu-fp16','gpu-fp32']);
  const card=await openSpeechSettings(page),row=mode=>card.locator(`[data-speech-mode="${mode}"]`);
  await expect(card.getByRole('button',{name:'Remove speech model',exact:true})).toHaveCount(3);
  for(const mode of ['cpu','gpu-fp32','gpu-fp16']){
    await row(mode).getByRole('button',{name:'Load speech model',exact:true}).click();
    await expect(row(mode).getByRole('button',{name:'Unload speech model',exact:true})).toBeVisible();
    await expect(row(mode)).toHaveAttribute('data-selected','true');
    await expect(card.getByRole('button',{name:'Unload speech model',exact:true})).toHaveCount(1);
  }
  await row('cpu').getByRole('button',{name:'Remove speech model',exact:true}).click();
  await expect(row('cpu').getByRole('button',{name:'Install speech model',exact:true})).toBeEnabled();
  for(const mode of ['gpu-fp16','gpu-fp32']){
    const remove=row(mode).getByRole('button',{name:'Remove speech model',exact:true});
    await expect(remove.locator('.material-symbols-rounded')).toHaveText('delete');await remove.click();
    await expect(row(mode).getByRole('button',{name:'Install speech model',exact:true})).toBeEnabled();
  }
  expect(this.requests.filter(request=>/huggingface\.co|raw\.githubusercontent\.com/.test(request.url))).toHaveLength(0);
});
Then('previously saved speech recordings are removed while model downloads remain', async function () {
  const page=this.page;
  await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('code-speech-diagnostics',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('recordings',{keyPath:'id'});
      request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result);
    });
    try{
      const tx=db.transaction('recordings','readwrite');
      tx.objectStore('recordings').put({id:'previous-recording',audio:new Blob(['old recording']),transcript:'old transcript'});
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    }finally{db.close();}
    const cache=await caches.open('code-speech-artifacts-v1');await cache.put('/__speech-retention-guard',new Response('installed model data'));
  });
  await page.reload({waitUntil:'networkidle'});
  await expect.poll(()=>page.evaluate(async()=>(await indexedDB.databases()).some(db=>db.name==='code-speech-diagnostics'))).toBe(false);
  expect(await page.evaluate(async()=>await(await(await caches.open('code-speech-artifacts-v1')).match('/__speech-retention-guard')).text())).toBe('installed model data');
  const card=await openSpeechSettings(page);await expect(card.getByText('Local recording diagnostics',{exact:true})).toHaveCount(0);
});
Then('an AI draft exposes speech input beside the composer controls', async function () {
  const page = this.page; await fakeAI(page); await selectPage(page, 'Editor'); await page.getByRole('button', { name: 'AI chat', exact: true }).click();
  await openComposer(page);
  await expect(page.getByRole('button', { name: 'Speech input', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Message AI', exact: true }).fill('Keep this draft.');
  await expect(page.getByRole('button', { name: 'Speech input options', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-ollama-panel] .speech-options-panel')).toHaveCount(0);
  await expect(page.locator('.speech-tools button')).toHaveCount(2);
  await page.getByRole('button',{name:'Speech model',exact:true}).click();
  const menu=page.getByRole('menu',{name:'Speech model',exact:true});
  await expect(menu.getByRole('menuitemradio')).toHaveCount(3);
  await expect(menu.getByRole('menuitem',{name:'Start dictation',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.composer-controls')).toHaveCSS('border-bottom-width', '2px');
  await selectPage(page, 'Editor');
  await expect(page.getByRole('textbox', { name: 'Message AI', exact: true })).toHaveText('Keep this draft.');
});
async function holdMicrophone(page){
  await page.evaluate(()=>{globalThis.speechMicrophoneRequests=0;navigator.mediaDevices.getUserMedia=()=>{globalThis.speechMicrophoneRequests++;return new Promise(()=>{});};});
}
Then('the composer uses {word} installed speech models and dictates with {word}', { timeout: 60000 }, async function (installation,selection) {
  const page=this.page,loaded=[];page.on('console',message=>{if(message.text().startsWith('speech-fixture-load '))loaded.push(message.text().slice(20));});
  await cacheSpeechModels(page,installation==='one'?['cpu']:['cpu','gpu-fp16','gpu-fp32']);
  await holdMicrophone(page);await fakeAI(page);await openComposer(page);
  const draft=page.getByRole('textbox',{name:'Message AI',exact:true});await draft.fill('Keep this dictation draft.');
  const model=page.getByRole('button',{name:'Speech model',exact:true});
  await expect(model).toHaveAttribute('data-value',installation==='one'?'cpu':'gpu-fp32');
  await model.click();const menu=page.getByRole('menu',{name:'Speech model',exact:true});
  expect(await menu.getByRole('menuitemradio').evaluateAll(items=>items.map(item=>item.dataset.value))).toEqual(['cpu','gpu-fp16','gpu-fp32']);
  await expect(menu.getByText(/Install ·/)).toHaveCount(installation==='one'?2:0);
  await page.keyboard.press('Escape');await selectDropdown(page,'Speech model',selection);
  await expect(model).toHaveAttribute('data-value',selection);
  await expect.poll(()=>loaded).toEqual([selection]);
  await expect(page.getByRole('button',{name:'Cancel speech loading',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>speechMicrophoneRequests)).toBe(0);
  const dictate=page.getByRole('button',{name:'Speech input',exact:true});await page.getByRole('button',{name:'Speech input',exact:true}).click();
  await expect(dictate).toContainText('Cancel microphone');expect(loaded).toEqual([selection]);
  expect(await page.evaluate(()=>speechMicrophoneRequests)).toBe(1);
  await expect(model).toBeEnabled();
  if(installation==='multiple'){
    await selectDropdown(page,'Speech model','cpu');
    await expect(page.locator('.speech-status')).toContainText('queued');
    expect(loaded).toEqual([selection]);
  }
  await expect(page.locator('[data-settings-panel]')).toHaveCount(0);
  await page.getByRole('button',{name:'Speech input',exact:true}).click();
  if(installation==='multiple')await expect.poll(()=>loaded).toEqual([selection,'cpu']);
  await expect(dictate).toContainText('Dictate');await expect(dictate).toBeEnabled();
  await expect(draft).toHaveText('Keep this dictation draft.');
  expect(this.requests.filter(request=>/huggingface\.co|raw\.githubusercontent\.com/.test(request.url))).toHaveLength(0);
});
Then('the speech model menu installs a missing variant and can cancel its download', { timeout: 60000 }, async function () {
  const page=this.page;await cacheSpeechModels(page,['cpu']);await holdMicrophone(page);
  let release,downloads=0;const held=new Promise(resolve=>release=resolve);
  await this.context.route('https://huggingface.co/**',async route=>{downloads++;await held;await route.abort().catch(()=>{});});
  try {
    await page.getByRole('button',{name:'AI chat',exact:true}).click();
    const draft=page.getByRole('textbox',{name:'Message AI',exact:true});await draft.fill('Keep this download draft.');
    await selectDropdown(page,'Speech model','gpu-fp16');
    await expect.poll(()=>downloads).toBeGreaterThan(0);
    await expect(page.getByRole('button',{name:'Cancel speech loading',exact:true})).toContainText('Cancel install');
    await page.getByRole('button',{name:'Cancel speech loading',exact:true}).click();await expect(page.getByRole('button',{name:'Speech input',exact:true})).toBeEnabled();
    await expect(draft).toHaveText('Keep this download draft.');
    expect(await page.evaluate(()=>speechMicrophoneRequests)).toBe(0);
  } finally { release(); }
});
Then('cancelling speech loading or switching conversations prevents microphone capture', { timeout: 60000 }, async function () {
  const page=this.page;await cacheSpeechModels(page,['cpu'],1000);await holdMicrophone(page);await fakeAI(page);await openComposer(page);
  const dictate=page.getByRole('button',{name:'Speech input',exact:true});
  await page.getByRole('button',{name:'Speech input',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel speech loading',exact:true})).toContainText('Cancel loading');await page.getByRole('button',{name:'Cancel speech loading',exact:true}).click();await expect(dictate).toBeEnabled();
  await page.waitForTimeout(1100);expect(await page.evaluate(()=>speechMicrophoneRequests)).toBe(0);
  await page.getByRole('button',{name:'Speech input',exact:true}).click();await expect(page.getByRole('button',{name:'Cancel speech loading',exact:true})).toContainText('Cancel loading');await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.waitForTimeout(1100);expect(await page.evaluate(()=>speechMicrophoneRequests)).toBe(0);
  await page.getByRole('tab',{name:'Session 1',exact:true}).click();await expect(dictate).toBeEnabled();
});
Then('browser speech storage rejects corrupt streams and restores verified artifacts offline', { timeout: 60000 }, async function () {
  await this.page.addScriptTag({ content: await speechBrowserFixture() });
  const result = await this.page.evaluate(async () => {
    const bytes = new TextEncoder().encode('verified local speech fixture'), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const file = { id: 'test', bytes: bytes.length, sha256: hash, type: 'model', url: '/test-weight' }, cache = await caches.open('code-speech-test-fixture');
    const signal = new AbortController().signal; let rejected = false;
    try { await speechTest.cacheSpeechArtifact(cache, file, () => {}, signal, async () => new Response(new Uint8Array(bytes.length))); } catch { rejected = true; }
    const absent = (await cache.keys()).length === 0;
    await speechTest.cacheSpeechArtifact(cache, file, () => {}, signal, async () => new Response(bytes));
    let fetches = 0; await speechTest.cacheSpeechArtifact(cache, file, () => {}, signal, async () => { fetches++; throw new Error('offline'); });
    const saved = await (await cache.match(new URL(`/__code_speech__/${hash}`, location.origin))).text(); await caches.delete('code-speech-test-fixture');
    return { rejected, absent, fetches, saved };
  });
  expect(result).toEqual({ rejected: true, absent: true, fetches: 0, saved: 'verified local speech fixture' });
});
