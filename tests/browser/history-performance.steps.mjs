// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Given,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved',{timeout:30_000});
const editor=page=>page.getByLabel('Code editor document',{exact:true});
const text=page=>editor(page).evaluate(element=>[...element.querySelectorAll('.cm-line')].map(line=>line.textContent).join('\n'));
Given('a history profiling repository with {int} files and {int} document transactions',{timeout:120_000},async function(files,transactions){
  const directory=join(this.artifactDirectory,'history-profile');await mkdir(directory,{recursive:true});
  await Promise.all(Array.from({length:files},(_,index)=>writeFile(join(directory,`file${index}.js`),'const value = 0;\n'.repeat(20))));
  await this.page.getByLabel('Import directory',{exact:true}).setInputFiles(directory);await saved(this.page);
  await this.page.getByRole('treeitem',{name:'file0.js',exact:true}).locator(':scope > .tree-row').click();
  await expect(editor(this.page)).toBeVisible();await editor(this.page).click();await this.page.keyboard.press('Control+End');
  this.historyInitial=await text(this.page);this.historyTransactions=transactions;
  for(let index=0;index<transactions;index++){
    // Cursor movement separates logical steps without adding an idle wait to
    // profiling. Saves are still queued without waiting for acknowledgement.
    await this.page.keyboard.press('ArrowLeft');await this.page.keyboard.press('Control+End');
    await this.page.keyboard.insertText('x');
  }
  await saved(this.page);this.historyFinal=await text(this.page);
  assert.equal(this.historyFinal,this.historyInitial+'x'.repeat(transactions));
});
Then('repeated undo and redo preserve the live editor and report their resource costs',{timeout:120_000},async function(){
  // DevTools instruments the actual rendered application. Profiling is opt-in
  // because its recording overhead must not become a timing assertion in CI.
  const cdp=await this.context.newCDPSession(this.page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  const capture=process.env.PROFILE_HISTORY==='true';
  await this.page.evaluate(()=>{window.__historyEditor=document.querySelector('.editor-document .cm-editor');});
  if(capture){
    await mkdir(this.artifactDirectory,{recursive:true});
    await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});await cdp.send('Profiler.start');
    await cdp.send('Tracing.start',{categories:'devtools.timeline,v8.execute,disabled-by-default-v8.cpu_profiler,blink.user_timing,IndexedDB',transferMode:'ReturnAsStream'});
  }
  const samples=[];
  try{
    for(const direction of ['Undo','Redo','Undo','Redo','Undo','Redo']){
      const before=await metrics();
      const ms=await this.page.evaluate(async direction=>{
        const button=[...document.querySelectorAll('button')].find(node=>node.getAttribute('aria-label')===direction);
        const status=document.querySelector('[aria-label="Persistence status"]'),initial=document.querySelector('.cm-content').textContent;
        const start=performance.now();performance.mark(`history:${direction}:start`);button.click();
        do{
          await new Promise(resolve=>requestAnimationFrame(resolve));
          if(performance.now()-start>15_000)throw Error(`${direction} did not complete`);
        }while(status.textContent!=='All changes saved'||document.querySelector('.cm-content').textContent===initial);
        performance.mark(`history:${direction}:end`);return performance.now()-start;
      },direction);
      const after=await metrics();
      samples.push({direction,ms,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,
        layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,heapBytes:after.JSHeapUsedSize});
      await expect.poll(()=>text(this.page)).toBe(direction==='Redo'?this.historyFinal:this.historyFinal.slice(0,-1));
      assert.equal(await this.page.evaluate(()=>window.__historyEditor===document.querySelector('.editor-document .cm-editor')),true);
      await expect(this.page.getByRole('alert')).toHaveCount(0);
    }
  }finally{
    if(capture){
      const {profile}=await cdp.send('Profiler.stop');await writeFile(join(this.artifactDirectory,'history.cpuprofile'),JSON.stringify(profile));
      const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');
      const {stream}=await complete;let trace='';
      try{for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}}
      finally{await cdp.send('IO.close',{handle:stream});}
      await writeFile(join(this.artifactDirectory,'history.trace.json'),trace);
    }
    await cdp.detach();
  }
  await this.attach(JSON.stringify(samples,null,2),'application/vnd.code.history-performance+json');
  if(capture)await writeFile(join(this.artifactDirectory,'history-timings.json'),JSON.stringify(samples,null,2));
});
Then('rapid history shortcuts restore every transaction in order',{timeout:120_000},async function(){
  await editor(this.page).focus();
  for(let index=0;index<this.historyTransactions;index++)await this.page.keyboard.press('Control+z');
  await expect.poll(()=>text(this.page),{timeout:30_000}).toBe(this.historyInitial);await saved(this.page);
  for(let index=0;index<this.historyTransactions;index++)await this.page.keyboard.press(index%2?'Control+Shift+Z':'Control+y');
  await expect.poll(()=>text(this.page),{timeout:30_000}).toBe(this.historyFinal);await saved(this.page);
  await this.page.reload();await saved(this.page);await expect.poll(()=>text(this.page)).toBe(this.historyFinal);
  await expect(this.page.getByRole('alert')).toHaveCount(0);
});
