// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Then,Given,When} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved',{timeout:30_000});
Then('repeated tab switches report selection and persistence costs',{timeout:60_000},async function(){
  await saved(this.page);await this.context.tracing.stop();
  const cdp=await this.context.newCDPSession(this.page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  const samples=[];
  try{
    for(let index=0;index<8;index++){
      const before=await metrics();
      const sample=await this.page.evaluate(path=>new Promise((resolve,reject)=>{
        const button=document.querySelector(`[aria-label="Switch to ${path}"]`),start=performance.now();
        let selected,ready;
        const sample=()=>{
          if(selected===undefined&&button.classList.contains('active'))selected=performance.now()-start;
          if(ready===undefined&&selected!==undefined&&document.querySelector('.primary-pane .cm-content')?.getAttribute('aria-readonly')==='false')ready=performance.now()-start;
          const status=document.querySelector('[aria-label="Persistence status"]').textContent;
          if(selected!==undefined&&ready!==undefined&&status==='All changes saved')resolve({path,selectedMs:selected,readyMs:ready,savedMs:performance.now()-start});
          else if(performance.now()-start>15_000)reject(Error('Tab selection did not finish'));
          else requestAnimationFrame(sample);
        };
        button.click();requestAnimationFrame(sample);
      }),index%2?'file2.txt':'file10.txt');
      const after=await metrics();samples.push({...sample,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,
        taskMs:(after.TaskDuration-before.TaskDuration)*1000});
    }
  }finally{await cdp.detach();await this.context.tracing.start({screenshots:true,snapshots:true,sources:true});}
  await this.attach(JSON.stringify(samples,null,2),'application/vnd.code.tab-selection+json');
  if(process.env.TAB_SELECTION_OUTPUT)await writeFile(process.env.TAB_SELECTION_OUTPUT,JSON.stringify(samples,null,2)+'\n');
});

Given('selection targets are ready in the {string} pane',async function(pane){
  if(pane==='split'){
    await this.page.getByRole('button',{name:'Switch to file2.txt',exact:true}).click({button:'right'});
    await this.page.getByRole('menu',{name:'Tab actions for file2.txt',exact:true}).getByRole('menuitem',{name:'Open in split view',exact:true}).click();
    await saved(this.page);
    await this.page.getByLabel('Split editor document',{exact:true}).click();
    await this.page.getByRole('button',{name:'Open file diff',exact:true}).click();await saved(this.page);
    await this.page.getByRole('button',{name:'Focus split file file2.txt',exact:true}).click();await saved(this.page);
  }
  this.responsivePane=pane;
  this.responsiveTargets=pane==='split'?['Focus split file file2.txt (diff)','Focus split file file2.txt']:['Switch to file10.txt','Switch to file2.txt'];
});
Given('the next navigation history write is held',async function(){
  await saved(this.page);
  await this.page.evaluate(()=>{
    const send=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...options){
      if(message?.method!=='recordActivity'||message.args[0].command)return send.call(this,message,...options);
      Worker.prototype.postMessage=send;
      window.__releaseNavigation=()=>{delete window.__releaseNavigation;send.call(this,message,...options);};
    };
  });
});
When('I select the first responsive tab target',async function(){
  this.responsiveTarget=this.responsiveTargets[0];
  await this.page.getByRole('button',{name:this.responsiveTarget,exact:true}).click();
});
When('I select the second responsive tab target',async function(){
  this.responsiveTarget=this.responsiveTargets[1];
  await this.page.getByRole('button',{name:this.responsiveTarget,exact:true}).click();
});
Then('the responsive tab target is selected and editable before history saves',async function(){
  await expect.poll(()=>this.page.evaluate(()=>typeof window.__releaseNavigation)).toBe('function');
  await expect(this.page.getByRole('button',{name:this.responsiveTarget,exact:true})).toHaveClass(/\bactive\b/);
  const label=this.responsivePane==='primary'?'Code editor document':this.responsiveTarget.endsWith('(diff)')?'Current file':'Split editor document';
  await expect(this.page.getByLabel(label,{exact:true})).toBeEditable();
  await expect(this.page.locator('#panel-editor')).toHaveAttribute('aria-busy','false');
  await expect(this.page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('Saving changes…');
});
When('I edit the responsive tab before its navigation history saves',async function(){
  const label=this.responsivePane==='primary'?'Code editor document':'Split editor document';
  const document=this.page.getByLabel(label,{exact:true});await document.focus();
  await this.page.keyboard.press('Control+End');await this.page.keyboard.insertText('!');
  await expect(document).toContainText('!');
  assert.equal(await this.page.evaluate(()=>typeof window.__releaseNavigation),'function');
});
When('I release the navigation history write',async function(){
  await this.page.evaluate(()=>window.__releaseNavigation());await saved(this.page);
});
Then('the responsive tab and its edit survive reload',async function(){
  await this.page.reload();await saved(this.page);
  await expect(this.page.getByRole('button',{name:this.responsiveTarget,exact:true})).toHaveClass(/\bactive\b/);
  await expect(this.page.getByLabel(this.responsivePane==='primary'?'Code editor document':'Split editor document',{exact:true})).toContainText('!');
  await expect(this.page.getByRole('alert')).toHaveCount(0);
});

Then('file switching leaves hidden history controls untouched',async function(){
  const page=this.page;
  await saved(page);
  const before=await repositoryHistories(page);
  assert.equal(before.edits.length,40);
  await expect(page.locator('[data-history-panel]')).toHaveCount(0);
  await page.getByRole('treeitem',{name:'file1.js',exact:true}).locator(':scope > .tree-row').click();await saved(page);
  for(const file of ['file0.js','file1.js','file0.js']){
    await page.getByRole('button',{name:`Switch to ${file}`,exact:true}).click();await saved(page);
    await expect(page.getByRole('button',{name:`Switch to ${file}`,exact:true})).toHaveClass(/\bactive\b/);
  }
  await expect(page.locator('[data-history-panel]')).toHaveCount(0);
  assert.deepEqual(await repositoryHistories(page),before,'File navigation must leave closed History unmounted and unchanged');
});
