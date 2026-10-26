// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {BROWSER_PROFILES,VISION_PROFILES,DECISION_PROFILES} from '../../src/lib/assistant/browser/catalog.ts';
import {selectPage} from './navigation.helpers.mjs';
import {cacheSpeechModels,openSpeechSettings} from '../speech/browser-harness.mjs';
Then('the dictation footer shows loading progress and preserves its draft when cancelled',async function(){
  const page=this.page;await cacheSpeechModels(page,['cpu'],30000);await page.getByRole('button',{name:'AI chat',exact:true}).click();
  const draft=page.getByRole('textbox',{name:'Message AI',exact:true});await draft.fill('Keep this draft.');
  await page.getByRole('button',{name:'Speech model',exact:true}).click();await page.getByRole('menu',{name:'Speech model',exact:true}).locator('[data-value="cpu"]').click();
  const bar=page.getByRole('progressbar',{name:'Speech preparation',exact:true});await expect(bar).toBeVisible();await expect(bar).toHaveAttribute('data-indeterminate','true');
  expect(await bar.evaluate(node=>node.getBoundingClientRect().width>100)).toBe(true);
  const progressBounds=await bar.boundingBox(),buttonBounds=await page.getByRole('button',{name:'Cancel speech loading',exact:true}).boundingBox();
  expect(progressBounds.y).toBeGreaterThanOrEqual(buttonBounds.y+buttonBounds.height);
  await mkdir(this.artifactDirectory,{recursive:true});await page.locator('.ollama-panel').screenshot({path:`${this.artifactDirectory}/dictation-preparing.png`});
  await page.getByRole('button',{name:'Cancel speech loading',exact:true}).click();await expect(bar).toHaveCount(0);await expect(draft).toHaveText('Keep this draft.');
});

Then('model settings summaries fit in {string} mode at {int} pixels',async function(mode,width){
  const page=this.page;await page.setViewportSize({width,height:1000});await selectPage(page,'Settings','AI');
  await page.evaluate(mode=>{document.documentElement.dataset.theme=mode;document.documentElement.classList.toggle('dark',mode==='dark');},mode);
  await mkdir(this.artifactDirectory,{recursive:true});
  const strands=DECISION_PROFILES.filter(profile=>profile.engine==='strands-onnx');
  for(const profile of strands)await expect(page.locator(`[data-model-id="${profile.id}"] .model-name`)).toHaveText(profile.runtime_id==='strands-cpu'?'Strands · CPU':'Strands · WebGPU');
  for(const profile of [VISION_PROFILES[0],DECISION_PROFILES[0],...strands,BROWSER_PROFILES.find(profile=>profile.engine==='litert-lm')]){
    const row=page.locator(`[data-model-id="${profile.id}"]`);await row.getByRole('button',{name:'Model settings',exact:true}).click();
    const panel=row.getByRole('region',{name:'Model settings',exact:true});await expect(panel).toBeVisible();
    await expect.poll(()=>panel.evaluate(node=>{const note=node.querySelector('.model-footnote'),grid=note.parentElement;return note.getBoundingClientRect().width/grid.getBoundingClientRect().width;})).toBeGreaterThan(.95);
    if(profile.category==='llm'){
      const context=await panel.getByLabel('Context tokens',{exact:true}).boundingBox(),output=await panel.getByLabel('Maximum output tokens',{exact:true}).boundingBox();
      expect(Math.abs(context.y-output.y)).toBeLessThan(2);
    }else{
      await expect(panel.getByRole('spinbutton')).toHaveCount(0);
      await expect(panel.getByRole('button',{name:'Browser execution',exact:true})).toHaveCount(0);
    }
    expect(await row.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    await row.screenshot({path:`${this.artifactDirectory}/${profile.category}-${mode}-${width}.png`});
  }
});

Then('speech model preparation has shared progress and readable compact model controls',{timeout:60000},async function(){
  const page=this.page;await cacheSpeechModels(page,['cpu'],30000);const card=await openSpeechSettings(page),row=card.locator('[data-speech-mode="cpu"]');
  await row.getByRole('button',{name:'Load speech model',exact:true}).click();
  const bar=row.getByRole('progressbar',{name:'Speech model loading',exact:true});await expect(bar).toBeVisible();await expect(bar).toHaveAttribute('data-indeterminate','true');
  expect(await bar.getAttribute('aria-valuenow')).toBeNull();
  const status=row.getByRole('status');await expect(status.locator('.operation-heading .material-symbols-rounded')).toHaveText('hourglass_top');
  expect(await status.evaluate(node=>getComputedStyle(node).backgroundColor===getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim()||getComputedStyle(node).backgroundColor===getComputedStyle(node.closest('.model-unit')).backgroundColor)).toBe(true);
  await page.emulateMedia({reducedMotion:'no-preference'});await expect(bar.locator('span')).toHaveCSS('animation-name',/model-progress-slide/);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(bar.locator('span')).toHaveCSS('animation-name','none');
  await mkdir(this.artifactDirectory,{recursive:true});await row.screenshot({path:`${this.artifactDirectory}/speech-loading.png`});
  await row.getByRole('button',{name:'Cancel',exact:true}).click();await expect(bar).toHaveCount(0);
  await cacheSpeechModels(page,['cpu']);await row.getByRole('button',{name:'Load speech model',exact:true}).click();await expect(row.getByRole('button',{name:'Unload speech model',exact:true})).toBeVisible();
  await expect(row.getByRole('status').locator('.operation-heading .material-symbols-rounded')).toHaveText('check_circle');
  for(const width of [1280,620]){
    await page.setViewportSize({width,height:1000});
    const data=await row.evaluate(node=>{const name=node.querySelector('.model-name'),bounds=node.getBoundingClientRect();return{readable:name.scrollWidth<=name.clientWidth+1,fits:[...node.querySelectorAll('.model-actions button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=bounds.left-1&&r.right<=bounds.right+1;})};});
    expect(data).toEqual({readable:true,fits:true});await row.screenshot({path:`${this.artifactDirectory}/speech-loaded-${width}.png`});
  }
});

Then('speech and language model errors use the same divided alert layout',async function(){
  const page=this.page;await selectPage(page,'Settings','AI');
  const language=page.locator(`[data-model-id="${BROWSER_PROFILES[0].id}"]`);await language.getByRole('button',{name:'Model settings',exact:true}).click();await language.getByLabel('Context tokens',{exact:true}).fill('1');await expect(language.getByRole('alert')).toContainText('context_tokens');
  await page.evaluate(()=>{
    const put=Cache.prototype.put,fetch=globalThis.fetch;
    Cache.prototype.put=function(request,response){return String(request).includes('/__code_speech__/')?Promise.reject(new DOMException('Storage quota exceeded.','QuotaExceededError')):put.call(this,request,response);};
    globalThis.fetch=(input,init)=>String(input).includes('huggingface.co')?Promise.resolve(new Response(new ReadableStream())):fetch(input,init);
  });
  const speech=page.locator('[data-speech-mode="gpu-fp32"]');await speech.getByRole('button',{name:'Install speech model',exact:true}).click();await expect(speech.getByRole('alert')).toContainText('The browser ran out of storage');await expect(speech.getByRole('status')).toHaveCount(0);
  const styles=await Promise.all([language,speech].map(row=>row.getByRole('alert').evaluate(node=>{const s=getComputedStyle(node);return{background:s.backgroundColor,color:s.color,padding:s.padding,gap:s.gap,divider:s.borderTopWidth,icon:node.querySelector('.material-symbols-rounded').textContent};})));
  expect(styles[1]).toEqual(styles[0]);expect(styles[0].divider).toBe('1px');expect(styles[0].icon).toBe('error');await mkdir(this.artifactDirectory,{recursive:true});await speech.screenshot({path:`${this.artifactDirectory}/speech-error.png`});
});
