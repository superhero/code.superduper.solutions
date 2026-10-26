// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Given,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {repositorySnapshot,repositoryGitStatus} from './repository-snapshot.helpers.mjs';
import {openGitStaging} from './navigation.helpers.mjs';
const panel=page=>page.locator('[data-git-panel]');
const button=(page,name)=>panel(page).getByRole('button',{name,exact:true});
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');

Given('a populated staging performance workspace',{timeout:90000},async function(){
  const page=this.page,root=join(this.artifactDirectory,'staging-project');
  const code=Array.from({length:400},(_,i)=>`export function value${i}(input) { return input + ${i}; }`).join('\n')+'\n';
  const files={'main.js':code,'second.js':code,'.editorconfig':'root = true\n\n[*]\nindent_style = space\nindent_size = 2\n',
    'README.md':'Staging performance fixture\n','data.json':'{"fixture":true}\n','notes.txt':'Stable working files\n'};
  await mkdir(root,{recursive:true});
  for(const [path,text] of Object.entries(files))await writeFile(join(root,path),text);
  this.stagingFixtureHash=createHash('sha256').update(JSON.stringify(files)).digest('hex');
  await page.setViewportSize({width:2300,height:1000});
  await page.getByLabel('Import repository',{exact:true}).setInputFiles(root);await saved(page);
  const openFile=async path=>{await page.getByRole('treeitem',{name:path,exact:true}).locator(':scope > .tree-row').click();await saved(page);};
  await openFile('main.js');
  await openGitStaging(page);if(await button(page,'Stage all').isEnabled())await button(page,'Stage all').click();
  await expect(panel(page).locator('.staged-count')).toHaveText('6 files staged');
  await panel(page).getByLabel('Commit author name',{exact:true}).fill('Fixture author');
  await panel(page).getByLabel('Commit author email',{exact:true}).fill('fixture@example.invalid');
  await panel(page).getByLabel('Subject',{exact:true}).fill('Staging baseline');
  await button(page,'Commit staged changes').click();await expect(panel(page).locator('.file-row')).toHaveCount(0);
  await button(page,'Close').click();await saved(page);
  await page.getByLabel('Code editor document',{exact:true}).fill(code.replace('input + 0','input + 1000'));await saved(page);
  await openFile('second.js');
  await page.getByLabel('Code editor document',{exact:true}).fill(code.replace('input + 1;','input + 2000;'));await saved(page);
  await openFile('main.js');
  await page.getByRole('button',{name:'Switch to second.js',exact:true}).click({button:'right'});
  await page.getByRole('menu',{name:'Tab actions for second.js',exact:true}).getByRole('menuitem',{name:'Open in split view',exact:true}).click();await saved(page);
  await page.getByRole('button',{name:'Open History',exact:true}).click();
  await page.getByRole('button',{name:'AI chat',exact:true}).click();
  await openGitStaging(page);if(await button(page,'Stage all').isEnabled())await button(page,'Stage all').click();
  await expect(panel(page).locator('.staged-count')).toHaveText('2 files staged');await saved(page);
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
});

Then('repeated index updates preserve the workspace and report their costs',{timeout:120000},async function(){
  const page=this.page,baseline=process.env.STAGING_REFRESH_BASELINE==='true',before=await repositorySnapshot(page);
  const row=panel(page).locator('.file-row').filter({has:page.getByRole('button',{name:'main.js',exact:true})});
  const actions=[['Unstage all',null,0],['Stage file',row,1],['Unstage',row,0],['Stage all',null,2]];
  const activate=async([name,scope,count])=>{
    const target=(scope??panel(page)).getByRole('button',{name,exact:true});
    await expect(target).toBeEnabled();await target.click();
    if(count)await expect(panel(page).locator('.staged-count')).toHaveText(`${count} ${count===1?'file':'files'} staged`);
    else await expect(button(page,'Unstage all')).toBeDisabled();
    await expect(panel(page).locator('.activity')).toHaveCount(0);await saved(page);
  };
  await this.context.tracing.stop();
  const cdp=await this.context.newCDPSession(page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  const samples=[];
  try{
    for(const action of actions)await activate(action); // One warm-up cycle.
    await page.evaluate(()=>{
      const send=Worker.prototype.postMessage;
      window.__stagingMessages=[];window.__stagingCapturing=false;
      Worker.prototype.postMessage=function(message,...options){
        if(window.__stagingCapturing&&message?.method)window.__stagingMessages.push({method:message.method,path:message.method==='read'?message.args[1]:undefined});
        return send.call(this,message,...options);
      };
      window.__restoreStagingMessages=()=>{Worker.prototype.postMessage=send;};
    });
    for(let repeat=0;repeat<3;repeat++)for(const action of actions){
      const prior=await metrics();
      await page.evaluate(()=>{
        window.__stagingMessages=[];window.__stagingCapturing=true;
        window.__stagingCompletion=undefined;
        document.addEventListener('click',()=>{
          const start=performance.now();
          const check=()=>{
            if(!document.querySelector('[data-git-panel] .activity')&&document.querySelector('[aria-label="Persistence status"]').textContent==='All changes saved'){
              window.__stagingCapturing=false;window.__stagingCompletion=performance.now()-start;
            }else if(performance.now()-start>15000)throw Error('Index update did not finish');
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        },{capture:true,once:true});
      });
      await activate(action);
      await expect.poll(()=>page.evaluate(()=>window.__stagingCompletion)).not.toBeUndefined();
      const sample=await page.evaluate(()=>({elapsedMs:window.__stagingCompletion,messages:window.__stagingMessages})),after=await metrics();
      samples.push({repeat,action:action[0],...sample,scriptMs:(after.ScriptDuration-prior.ScriptDuration)*1000,
        taskMs:(after.TaskDuration-prior.TaskDuration)*1000,layoutMs:(after.LayoutDuration-prior.LayoutDuration)*1000,
        styleMs:(after.RecalcStyleDuration-prior.RecalcStyleDuration)*1000});
    }
    await page.evaluate(()=>{
      const content=document.querySelector('.primary-pane .cm-content');
      window.__stagingEditor=content;window.__stagingReadonlyMutations=0;
      window.__stagingReadonlyObserver=new MutationObserver(records=>window.__stagingReadonlyMutations+=records.length);
      window.__stagingReadonlyObserver.observe(content,{attributes:true,attributeFilter:['aria-readonly','contenteditable']});
      window.__stagingPaneNodes=[...document.querySelectorAll('.cm-editor, [data-history-panel] li[data-oid]')];
    });
    await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,v8,disabled-by-default-v8.cpu_profiler',transferMode:'ReturnAsStream'});
    for(const action of actions)await activate(action);
    const complete=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');
    const {stream}=await complete;let trace='';
    for(;;){const chunk=await cdp.send('IO.read',{handle:stream});trace+=chunk.data;if(chunk.eof)break;}
    await cdp.send('IO.close',{handle:stream});await writeFile(join(this.artifactDirectory,'staging-trace.json'),trace);
    const structure=await page.evaluate(()=>{
      window.__stagingReadonlyObserver.disconnect();
      return {readonlyMutations:window.__stagingReadonlyMutations,sameEditor:window.__stagingEditor===document.querySelector('.primary-pane .cm-content'),
        samePaneNodes:window.__stagingPaneNodes.every(node=>node.isConnected)};
    });
    assert.equal(structure.sameEditor,true);assert.equal(structure.samePaneNodes,true);
    if(!baseline){
      assert.equal(structure.readonlyMutations,0,'Index writes do not reconfigure working editors');
      for(const sample of samples){
        assert.equal(sample.messages.filter(message=>message.method==='read').length,0,'Index writes do not reread working files or editor rules');
        assert.equal(sample.messages.filter(message=>message.method==='gitStatus').length,1,'Each index write refreshes status once');
      }
      // Hold an actual journal request to check the lock independently of speed.
      const stagedBefore=await repositoryGitStatus(page),textBefore=await page.locator('.primary-pane .cm-content').textContent();
      await page.evaluate(()=>{
        const send=Worker.prototype.postMessage;
        Worker.prototype.postMessage=function(message,...options){
          if(message?.method!=='recordActivity'||message.args[0].command?.method!=='gitAction')return send.call(this,message,...options);
          Worker.prototype.postMessage=send;
          window.__releaseStagingLock=()=>{delete window.__releaseStagingLock;send.call(this,message,...options);};
        };
      });
      await button(page,'Unstage all').click();
      await expect.poll(()=>page.evaluate(()=>typeof window.__releaseStagingLock)).toBe('function');
      await expect(button(page,'Commit staged changes')).toBeDisabled();
      await expect(page.locator('.workbench')).toHaveAttribute('inert','');
      await page.evaluate(()=>{
        document.querySelector('[aria-label="Code editor document"]').focus();
        document.querySelector('[aria-label="Switch to second.js"]').click();
      });
      await page.keyboard.type('blocked while staging');
      assert.equal(await page.locator('.primary-pane .cm-content').textContent(),textBefore);
      await expect(page.locator('.file-tabs [data-tab-path="main.js"]')).toHaveClass(/active/);
      assert.deepEqual((await repositoryGitStatus(page)).files,stagedBefore.files);
      await this.attach(await page.screenshot({path:join(this.artifactDirectory,'staging-in-progress.png')}),'image/png');
      await page.evaluate(()=>window.__releaseStagingLock());
      await expect(button(page,'Unstage all')).toBeDisabled();await saved(page);
      await activate(actions[3]);
    }
    const after=await repositorySnapshot(page),status=await repositoryGitStatus(page);
    assert.equal(after.head,before.head);assert.equal(after.historyHead,before.historyHead);
    assert.deepEqual(after.history,before.history);assert.deepEqual(after.commits,before.commits);
    assert.equal(status.files.length,2);assert.ok(status.files.every(file=>file.head!==file.stage&&file.stage===file.work));
    const report={baseline,fixtureHash:this.stagingFixtureHash,browser:page.context().browser().version(),viewport:page.viewportSize(),samples,structure,
      limits:{timing:'Pointer click to observed ready UI on requestAnimationFrame; no Playwright trace in timed cycles. CDP duration counters are page-thread only.',storage:'Fresh isolated browser repository; workers reused; HTTP cache disabled by route; no inference or external requests.'}};
    const serialized=JSON.stringify(report,null,2)+'\n';await writeFile(join(this.artifactDirectory,'staging-performance.json'),serialized);
    if(process.env.STAGING_REFRESH_OUTPUT)await writeFile(process.env.STAGING_REFRESH_OUTPUT,serialized);
    await this.attach(serialized,'application/json');
    await this.attach(await page.screenshot({path:join(this.artifactDirectory,'staging-ready.png')}),'image/png');
  }finally{
    await page.evaluate(()=>{window.__releaseStagingLock?.();window.__restoreStagingMessages?.();});await cdp.detach();
    await this.context.tracing.start({screenshots:true,snapshots:true,sources:true});
  }
});
