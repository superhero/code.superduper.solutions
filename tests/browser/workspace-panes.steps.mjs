// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {openStagedHistory,selectSettingsTab} from './navigation.helpers.mjs';
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { repositorySnapshot } from './repository-snapshot.helpers.mjs';
const saved=page=>expect.poll(async()=>{const values=await page.getByRole('status',{name:'Persistence status',exact:true}).allTextContents();return values.length>0&&values.every(value=>value==='All changes saved');}).toBe(true);
const files=page=>page.getByRole('button',{name:'File explorer',exact:true});
const ai=page=>page.getByRole('button',{name:'AI chat',exact:true});
async function columns(page){
  await expect(page.locator('.workbench')).toBeVisible();
  await expect(page.getByRole('dialog',{name:/^(AI|Git|History|Vault|Resources|Settings)/})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>{
    const editor=document.querySelector('.workbench').getBoundingClientRect();
    const panes=[...document.querySelectorAll('.right-panes [data-slot="sheet-dock"]')].map(element=>element.getBoundingClientRect());
    return editor.width>=Math.min(320,innerWidth/2)-1&&panes.every(pane=>Math.abs(pane.y-editor.y)<1&&pane.x>=editor.right-1&&Math.abs(pane.height-editor.height)<1)&&document.documentElement.scrollWidth<=innerWidth+1;
  })).toBe(true);
  await expect.poll(()=>page.evaluate(()=>{
    const button=document.querySelector('button[aria-label="File explorer"]').getBoundingClientRect(),editor=document.querySelector('.workbench').getBoundingClientRect();
    return button.x>=editor.x-1&&button.right<=editor.right+1;
  }),{message:'Explorer control stays inside the editor viewport after layout settles'}).toBe(true);
}
async function openAll(page,width=2000){
  await page.setViewportSize({width,height:900});
  await openStagedHistory(page);
  await page.getByRole('button',{name:'Git operations',exact:true}).click();
  await ai(page).click();await saved(page);
  await expect(page.locator('[data-history-panel]')).toBeVisible();await expect(page.locator('[data-git-panel]')).toBeVisible();await expect(page.locator('[data-ollama-panel]')).toBeVisible();
  await columns(page);
}
Then('the file explorer headers align with the editor and its close control preserves the tree',async function(){
  const page=this.page;await saved(page);
  const explorer=page.getByRole('complementary',{name:'Repository explorer',exact:true});
  await expect(explorer.locator('footer').getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await expect(page.locator('.topbar').getByRole('status',{name:'Persistence status',exact:true})).toHaveCount(0);
  const branch=explorer.getByRole('button',{name:'Branch',exact:true});
  const selectedBranch=await branch.getAttribute('data-value');
  for(const width of [1440,700]){
    await page.setViewportSize({width,height:900});
    await expect(explorer.getByRole('button',{name:'Repository',exact:true})).toContainText('Pane layout');
    await expect.poll(()=>page.evaluate(()=>Math.max(...[
      ['.explorer-header','.topbar'],['.explorer-toolbar','.editor-toolbar'],['.explorer-tabs','.file-tabs']
    ].flatMap(([left,right])=>{
      const a=document.querySelector(left).getBoundingClientRect(),b=document.querySelector(right).getBoundingClientRect();
      return [Math.abs(a.top-b.top),Math.abs(a.bottom-b.bottom)];
    })))).toBeLessThan(1);
  }
  await explorer.getByRole('button',{name:'Close file explorer',exact:true}).click();
  await expect(explorer).toHaveCount(0);await saved(page);
  await expect(files(page)).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.topbar').getByRole('button',{name:'Repository',exact:true})).toBeVisible();
  await files(page).click();await saved(page);
  await expect(page.locator('.topbar').getByRole('button',{name:'Repository',exact:true})).toHaveCount(0);
  await expect(branch).toHaveAttribute('data-value',selectedBranch);
  await expect(explorer.getByRole('treeitem',{name:'main.js',exact:true})).toBeVisible();
});
Then('workspace panes remain columns while older panes close as the viewport narrows',{timeout:60000},async function(){
  const page=this.page,source=await repositorySnapshot(page);await openAll(page);
  for(const width of [1366,1100,800,600,320]){await page.setViewportSize({width,height:900});await columns(page);await saved(page);}
  await expect(files(page)).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('[data-history-panel]')).toHaveCount(0);await expect(page.locator('[data-git-panel]')).toHaveCount(0);await expect(page.locator('[data-ollama-panel]')).toBeVisible();
  await page.setViewportSize({width:600,height:900});
  await page.getByRole('button',{name:'Git operations',exact:true}).click();await saved(page);await columns(page);
  await expect(page.locator('[data-ollama-panel]')).toHaveCount(0);await expect(page.locator('[data-git-panel]')).toBeVisible();
  const after=await repositorySnapshot(page);assert.equal(after.head,source.head);assert.deepEqual(after.commits,source.commits);
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/narrow-columns.png`});
});
Then('Vault slides at the far right and preserves resizing and narrow columns with {string} motion',{timeout:90000},async function(motion){
  const page=this.page;await page.emulateMedia({reducedMotion:motion});await openAll(page,2400);
  const before=await repositorySnapshot(page);
  const opening=await page.evaluate(async motion=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const button=document.querySelector('button[aria-label="Vault"]');button.focus();button.click();await frame();
    const content=document.querySelector('[data-vault-panel]'),dock=content.closest('[data-slot="sheet-dock"]');
    const animations=dock.getAnimations().filter(animation=>animation.effect?.target===dock);
    if(motion==='reduce'){await frame();return {animations:animations.filter(animation=>animation.playState!=='finished').length,frames:[]};}
    for(const animation of animations)animation.pause();await Promise.all(animations.map(animation=>animation.ready));
    const frames=[];
    for(const fraction of [.2,.5,.8]){
      for(const animation of animations)animation.currentTime=Number(animation.effect.getTiming().duration)*fraction;
      await frame();frames.push({width:dock.getBoundingClientRect().width,content:content.getBoundingClientRect().width,right:dock.getBoundingClientRect().right});
    }
    for(const animation of animations)animation.finish();await frame();await frame();
    return {animations:animations.length,frames};
  },motion);
  await saved(page);await columns(page);
  const vault=page.locator('[data-vault-panel]'),full=await vault.boundingBox();
  const assistant=await page.locator('[data-ollama-panel]').boundingBox();
  expect(full.x).toBeGreaterThanOrEqual(assistant.x+assistant.width-1);expect(full.x+full.width).toBeCloseTo(2400,0);
  if(motion==='reduce')expect(opening.animations).toBe(0);
  else{
    expect(opening.animations).toBeGreaterThan(0);
    for(const frame of opening.frames){expect(frame.width).toBeGreaterThan(0);expect(frame.width).toBeLessThan(full.width);expect(frame.content).toBeCloseTo(full.width,0);expect(frame.right).toBeCloseTo(2400,0);}
    expect(opening.frames[0].width).toBeLessThan(opening.frames[2].width);
  }
  const divider=page.getByRole('separator',{name:'Resize Vault pane',exact:true});
  await divider.press('End');await saved(page);await expect.poll(async()=>(await vault.boundingBox()).width).toBeCloseTo(640,0);
  await page.reload();await saved(page);await columns(page);await expect.poll(async()=>(await vault.boundingBox()).width).toBeCloseTo(640,0);
  await page.getByLabel('Vault password',{exact:true}).fill('synthetic-vault-draft');
  await page.getByRole('button',{name:'Close Vault',exact:true}).click();
  await expect(page.getByRole('region',{name:'Vault',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Vault',exact:true}).click();await saved(page);
  await expect(page.getByLabel('Vault password',{exact:true})).toHaveValue('');
  for(const width of [1280,600,320]){
    await page.setViewportSize({width,height:900});await columns(page);await saved(page);await expect(vault).toBeVisible();
    const button=await page.getByRole('button',{name:'Vault',exact:true}).boundingBox(),editor=await page.locator('.workbench').boundingBox();
    expect(button.x).toBeGreaterThanOrEqual(editor.x);expect(button.x+button.width).toBeLessThanOrEqual(editor.x+editor.width+1);
  }
  await expect(page.locator('[data-history-panel]')).toHaveCount(0);await expect(page.locator('[data-git-panel]')).toHaveCount(0);await expect(page.locator('[data-ollama-panel]')).toHaveCount(0);
  const after=await repositorySnapshot(page);assert.equal(after.head,before.head);assert.deepEqual(after.commits,before.commits);
});
Then('the file explorer toggle stays reachable and swaps older panes on a narrow screen with {string} motion',async function(motion){
  const page=this.page;await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:600,height:850});await ai(page).click();await saved(page);await columns(page);
  await expect(files(page)).toHaveAttribute('aria-expanded','false');
  for(let index=0;index<2;index++){
    await files(page).click();await saved(page);await expect(files(page)).toHaveAttribute('aria-expanded','true');await expect(ai(page)).toHaveAttribute('aria-expanded','false');await columns(page);
    await expect(page.getByRole('complementary',{name:'Repository explorer',exact:true})).toBeVisible();
    await ai(page).click();await saved(page);await expect(files(page)).toHaveAttribute('aria-expanded','false');await expect(ai(page)).toHaveAttribute('aria-expanded','true');await columns(page);
  }
});
Then('the fitted column layout and file explorer visibility survive reload and expansion',{timeout:60000},async function(){
  const page=this.page;await openAll(page);await page.setViewportSize({width:600,height:850});await saved(page);await columns(page);
  await page.reload();await saved(page);await columns(page);await expect(files(page)).toHaveAttribute('aria-expanded','false');
  await expect(ai(page)).toHaveAttribute('aria-expanded','true');
  await page.setViewportSize({width:2000,height:900});await columns(page);await expect(files(page)).toHaveAttribute('aria-expanded','false');await expect(page.locator('[data-git-panel]')).toHaveCount(0);await expect(page.locator('[data-history-panel]')).toHaveCount(0);
  await files(page).click();await saved(page);await expect(files(page)).toHaveAttribute('aria-expanded','true');
  await files(page).click();await saved(page);await page.reload();await saved(page);await expect(files(page)).toHaveAttribute('aria-expanded','false');await columns(page);
});
Then('the file explorer content and editor move together on opening and closing with {string} motion',async function(motion){
  const page=this.page;await page.emulateMedia({reducedMotion:motion});await saved(page);
  const result=await page.evaluate(async motion=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const button=document.querySelector('button[aria-label="File explorer"]');
    const snapshot=()=>{
      const dock=document.querySelector('.explorer-dock')?.getBoundingClientRect(),content=document.querySelector('.sidebar')?.getBoundingClientRect(),editor=document.querySelector('.workbench').getBoundingClientRect();
      return {width:dock?.width??0,contentWidth:content?.width??0,left:content?.left??0,editorLeft:editor.left};
    };
    // Finish any initial entry before measuring a deliberate toggle.
    for(const animation of document.querySelector('.explorer-dock').getAnimations({subtree:true}))animation.finish();
    await frame();const full=snapshot();
    const toggle=async()=>{
      button.click();await frame();
      const dock=document.querySelector('.explorer-dock'),content=document.querySelector('.sidebar');
      const animations=dock?.getAnimations({subtree:true}).filter(animation=>[dock,content].includes(animation.effect?.target))??[];
      if(motion==='reduce'){await frame();return {animations:animations.filter(animation=>animation.playState!=='finished').length,frames:[snapshot()]};}
      for(const animation of animations)animation.pause();await Promise.all(animations.map(animation=>animation.ready));
      const frames=[];
      for(const fraction of [.2,.5,.8]){
        for(const animation of animations)animation.currentTime=Number(animation.effect.getTiming().duration)*fraction;
        await frame();frames.push(snapshot());
      }
      for(const animation of animations)animation.finish();await frame();await frame();
      return {animations:animations.length,frames};
    };
    const closing=await toggle(),closed=snapshot(),opening=await toggle(),opened=snapshot();
    return {full,closing,closed,opening,opened};
  },motion);
  expect(result.closed.width).toBe(0);expect(result.closed.editorLeft).toBe(0);
  expect(result.opened.width).toBeCloseTo(result.full.width,0);
  if(motion==='reduce'){expect(result.closing.animations).toBe(0);expect(result.opening.animations).toBe(0);return;}
  for(const run of [result.closing,result.opening]){
    expect(run.animations).toBeGreaterThan(0);
    for(const frame of run.frames){
      expect(frame.width).toBeGreaterThan(0);expect(frame.width).toBeLessThan(result.full.width);
      expect(frame.contentWidth).toBeCloseTo(result.full.contentWidth,0);
      expect(frame.left).toBeLessThan(0);expect(frame.left).toBeGreaterThan(-result.full.contentWidth);
      expect(frame.editorLeft).toBeCloseTo(frame.width,0);
    }
  }
  expect(result.closing.frames[0].left).toBeGreaterThan(result.closing.frames[2].left);
  expect(result.opening.frames[0].left).toBeLessThan(result.opening.frames[2].left);
  await columns(page);
});

Then('Resources slides after Vault and preserves resizing sampling and narrow columns with {string} motion',{timeout:90000},async function(motion){
  const page=this.page;await page.emulateMedia({reducedMotion:motion});await openAll(page,2800);
  await page.getByRole('button',{name:'Vault',exact:true}).click();await saved(page);
  const before=await repositorySnapshot(page);
  const opening=await page.evaluate(async motion=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const button=document.querySelector('button[aria-label="Resources"]');button.focus();button.click();await frame();
    const content=document.querySelector('[data-resources-panel]'),dock=content.closest('[data-slot="sheet-dock"]');
    const animations=dock.getAnimations().filter(animation=>animation.effect?.target===dock);
    if(motion==='reduce'){await frame();return {animations:animations.filter(animation=>animation.playState!=='finished').length,frames:[]};}
    for(const animation of animations)animation.pause();await Promise.all(animations.map(animation=>animation.ready));
    const frames=[];
    for(const fraction of [.2,.5,.8]){
      for(const animation of animations)animation.currentTime=Number(animation.effect.getTiming().duration)*fraction;
      await frame();frames.push({width:dock.getBoundingClientRect().width,content:content.getBoundingClientRect().width,right:dock.getBoundingClientRect().right});
    }
    for(const animation of animations)animation.finish();await frame();await frame();
    return {animations:animations.length,frames};
  },motion);
  await saved(page);await columns(page);
  const resources=page.locator('[data-resources-panel]'),full=await resources.boundingBox(),vault=await page.locator('[data-vault-panel]').boundingBox();
  expect(full.x).toBeGreaterThanOrEqual(vault.x+vault.width-1);expect(full.x+full.width).toBeCloseTo(2800,0);
  await expect(page.locator('.topbar').getByRole('heading',{name:'Editor',exact:true})).toBeVisible();
  if(motion==='reduce')expect(opening.animations).toBe(0);
  else{
    expect(opening.animations).toBeGreaterThan(0);
    for(const frame of opening.frames){expect(frame.width).toBeGreaterThan(0);expect(frame.width).toBeLessThan(full.width);expect(frame.content).toBeCloseTo(full.width,0);expect(frame.right).toBeCloseTo(2800,0);}
    expect(opening.frames[0].width).toBeLessThan(opening.frames[2].width);
  }
  const divider=page.getByRole('separator',{name:'Resize Resources pane',exact:true}),maximum=Number(await divider.getAttribute('aria-valuemax'));
  await divider.press('End');await saved(page);await expect.poll(async()=>(await resources.boundingBox()).width).toBeCloseTo(maximum,0);
  await page.reload();await saved(page);await columns(page);await expect.poll(async()=>(await resources.boundingBox()).width).toBeCloseTo(maximum,0);
  await expect.poll(async()=>Number(await resources.locator('.resources-page').getAttribute('data-samples'))).toBeGreaterThan(0);
  const count=Number(await resources.locator('.resources-page').getAttribute('data-samples'));
  await page.getByRole('button',{name:'Close Resources',exact:true}).click();
  await expect(page.getByRole('region',{name:'Resources',exact:true})).toHaveCount(0);await saved(page);
  await page.getByRole('button',{name:'Resources',exact:true}).click();await saved(page);
  expect(Number(await resources.locator('.resources-page').getAttribute('data-samples'))).toBeGreaterThanOrEqual(count);
  for(const width of [1280,600,320]){
    await page.setViewportSize({width,height:900});await columns(page);await saved(page);await expect(resources).toBeVisible();
    const button=await page.getByRole('button',{name:'Resources',exact:true}).boundingBox(),editor=await page.locator('.workbench').boundingBox();
    expect(button.x).toBeGreaterThanOrEqual(editor.x);expect(button.x+button.width).toBeLessThanOrEqual(editor.x+editor.width+1);
  }
  for(const selector of ['[data-history-panel]','[data-git-panel]','[data-ollama-panel]','[data-vault-panel]'])await expect(page.locator(selector)).toHaveCount(0);
  const after=await repositorySnapshot(page);assert.equal(after.head,before.head);assert.deepEqual(after.commits,before.commits);
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/resources-pane.png`});
});

Then('Vault and its neighbours stay aligned on opening closing and reversal with {string} motion at {int} pixels',{timeout:90000},async function(motion,width){
  const page=this.page;await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:motion});
  await ai(page).click();await page.getByRole('button',{name:'Resources',exact:true}).click();await saved(page);
  await page.locator('[data-resources-panel]').evaluate(async panel=>{await Promise.all(panel.closest('[data-slot="sheet-dock"]').getAnimations().map(animation=>animation.finished));});
  const source=await repositorySnapshot(page);
  const report=await page.evaluate(async()=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const bounds=selector=>{const node=document.querySelector(selector);if(!node)return null;const r=node.getBoundingClientRect();return {x:r.x,width:r.width,right:r.right};};
    const sample=()=>({editor:bounds('.workbench'),explorer:bounds('.explorer-dock'),ai:bounds('[data-ollama-panel]'),vault:bounds('[data-vault-panel]'),resources:bounds('[data-resources-panel]'),
      vaultDock:document.querySelector('[data-vault-panel]')?.closest('[data-slot="sheet-dock"]').getBoundingClientRect().width??0,
      overflow:document.documentElement.scrollWidth-innerWidth});
    const settled=async()=>{for(let i=0;i<30;i++){await frame();if(![...document.querySelectorAll('.app-shell')].flatMap(node=>node.getAnimations({subtree:true})).some(animation=>animation.playState==='running'&&animation.effect?.target?.matches('.sheet-dock, .docked-content, .explorer-dock, .sidebar'))){await frame();return;}}throw new Error('Pane motion did not settle');};
    await settled();const runs=[];
    for(let repeat=0;repeat<3;repeat++){
      for(const open of [true,false]){
        const before=sample(),frames=[];
        document.querySelector('button[aria-label="Vault"]').click();await frame();
        const animations=document.querySelector('.app-shell').getAnimations({subtree:true}).filter(animation=>animation.effect?.target?.matches('.sheet-dock, .docked-content, .explorer-dock, .sidebar'));
        for(const animation of animations)animation.pause();await Promise.all(animations.map(animation=>animation.ready));
        for(const fraction of [0,.25,.5,.75,1]){
          for(const animation of animations)animation.currentTime=Number(animation.effect.getTiming().duration)*fraction;
          await frame();frames.push(sample());
        }
        for(const animation of animations)animation.finish();await settled();
        runs.push({open,before,frames,after:sample()});
      }
    }
    const reversal=[];
    for(let i=0;i<4;i++){
      document.querySelector('button[aria-label="Vault"]').click();
      for(let j=0;j<2;j++){await frame();reversal.push(sample());}
    }
    await settled();reversal.push(sample());
    return {runs,reversal};
  });
  const {runs,reversal}=report;
  await mkdir(this.artifactDirectory,{recursive:true});await writeFile(`${this.artifactDirectory}/vault-neighbours.json`,JSON.stringify({motion,width,runs,reversal},null,2));
  await this.attach(JSON.stringify({motion,width,neighbourJumps:runs.map(run=>({open:run.open,ai:run.frames[0].ai.width-run.before.ai.width,resources:run.frames[0].resources.width-run.before.resources.width})),minimumEditor:Math.min(...runs.flatMap(run=>run.frames.map(frame=>frame.editor.width))),maximumResourceDrift:Math.max(...runs.flatMap(run=>run.frames.map(frame=>Math.abs(frame.resources.right-width))))}),'application/json');
  for(const run of runs){
    const first=run.frames[0];
    for(const pane of motion==='reduce'?[]:['ai','resources'])expect(Math.abs(first[pane].width-run.before[pane].width),`${pane} must not jump at the start of ${run.open?'opening':'closing'}`).toBeLessThan(2);
    for(const frame of run.frames){
      expect(frame.overflow).toBeLessThanOrEqual(1);expect(frame.resources.right).toBeCloseTo(width,0);
      expect(frame.editor.width).toBeGreaterThanOrEqual(319);
      expect(frame.ai.x).toBeGreaterThanOrEqual(frame.editor.right-1);
      if(!run.open&&frame.vault)expect(frame.vault.width).toBeCloseTo(run.before.vault.width,0);
    }
  }
  for(const frame of reversal){expect(frame.editor.width).toBeGreaterThanOrEqual(318);expect(frame.resources.right).toBeCloseTo(width,0);expect(frame.overflow).toBeLessThanOrEqual(1);}
  if(motion==='no-preference'&&width===1440){
    await page.evaluate(async()=>{
      document.querySelector('button[aria-label="Vault"]').click();
      await new Promise(resolve=>requestAnimationFrame(resolve));
      const animations=document.querySelector('.app-shell').getAnimations({subtree:true}).filter(animation=>animation.effect?.target?.matches('.sheet-dock, .docked-content, .explorer-dock, .sidebar'));
      for(const animation of animations)animation.pause();await Promise.all(animations.map(animation=>animation.ready));
      for(const animation of animations)animation.currentTime=Number(animation.effect.getTiming().duration)*.5;
      await new Promise(resolve=>requestAnimationFrame(resolve));
    });
    await this.attach(await page.screenshot({path:`${this.artifactDirectory}/vault-between-panes.png`}), 'image/png');
    await page.evaluate(async()=>{
      const animations=document.querySelector('.app-shell').getAnimations({subtree:true}).filter(animation=>animation.playState==='paused');
      for(const animation of animations)animation.finish();
      await new Promise(resolve=>requestAnimationFrame(resolve));
    });
    await page.getByRole('button',{name:'Close Vault',exact:true}).click();
    await expect(page.locator('[data-vault-panel]')).toHaveCount(0);
  }
  await saved(page);await columns(page);
  const after=await repositorySnapshot(page);assert.equal(after.head,source.head);assert.deepEqual(after.commits,source.commits);
});

Then('every side pane remains resizable after interrupted toggles with {string} motion',{timeout:120000},async function(motion){
  const page=this.page;await page.emulateMedia({reducedMotion:motion});await openAll(page,3200);await page.getByRole('button',{name:'Open History',exact:true}).click();
  await page.getByRole('button',{name:'Vault',exact:true}).click();await page.getByRole('button',{name:'Resources',exact:true}).click();await saved(page);
  const source=await repositorySnapshot(page);
  const states=await page.evaluate(async()=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const settle=async()=>{for(let i=0;i<90;i++){await frame();const saving=[...document.querySelectorAll('[aria-label="Persistence status"]')].some(node=>node.textContent!=='All changes saved');if(!saving&&!document.querySelector('.app-shell').getAnimations({subtree:true}).some(animation=>animation.playState==='running'&&animation.effect?.target?.matches('.sheet-dock, .docked-content, .explorer-dock, .sidebar'))){await frame();return;}}throw new Error('Dock animations or persistence did not settle');};
    const states=[];await settle();
    for(const label of ['Open History','Git operations','AI chat','Vault','Resources']){
      for(const delay of [0,1,3,12]){
        const toggle=document.querySelector(`.toolbar-right button[aria-label="${label}"]`);
        toggle.click();for(let i=0;i<delay;i++)await frame();toggle.click();await settle();
        const dividers=[...document.querySelectorAll('.right-panes .width-divider')].map(handle=>({name:handle.getAttribute('aria-label'),disabled:handle.getAttribute('aria-disabled'),pointerEvents:getComputedStyle(handle).pointerEvents,showing:handle.getBoundingClientRect().width>0,
          moving:handle.closest('.sheet-pane').dataset.paneMoving,inert:Boolean(handle.closest('[inert]'))}));
        states.push({label,delay,dividers});
      }
    }
    return states;
  });
  await mkdir(this.artifactDirectory,{recursive:true});await writeFile(`${this.artifactDirectory}/resize-recovery.json`,JSON.stringify({motion,states},null,2));
  const blocked=states.flatMap(state=>state.dividers.filter(handle=>handle.disabled!=='false'||handle.pointerEvents==='none'||handle.inert).map(handle=>({label:state.label,delay:state.delay,...handle})));
  await this.attach(JSON.stringify({motion,attempts:states.length,blocked}),'application/json');
  expect(blocked,'Resize handles must become usable after the actual slide finishes').toEqual([]);
  const panels={History:'[data-history-panel]',Git:'[data-git-panel]',AI:'[data-ollama-panel]',Vault:'[data-vault-panel]',Resources:'[data-resources-panel]'};
  for(const [name,selector] of Object.entries(panels)){
    const handle=page.getByRole('separator',{name:`Resize ${name} pane`,exact:true});
    const pane=page.locator(selector),before=(await pane.boundingBox()).width;
    await handle.press('ArrowLeft');await saved(page);await expect.poll(async()=>(await pane.boundingBox()).width).toBeCloseTo(before+16,0);
    const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+150;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-24,y,{steps:6});await page.mouse.up();await saved(page);
    await expect.poll(async()=>(await pane.boundingBox()).width).toBeCloseTo(before+40,0);
  }
  await page.setViewportSize({width:2048,height:900});await columns(page);await saved(page);
  const crowded=await page.locator('.right-panes').evaluate(container=>[...container.querySelectorAll('.width-divider')].map(handle=>({name:handle.getAttribute('aria-label'),width:handle.parentElement.getBoundingClientRect().width,maximum:Number(handle.getAttribute('aria-valuemax')),minimum:Number(handle.getAttribute('aria-valuemin')),disabled:handle.getAttribute('aria-disabled')})));
  await this.attach(JSON.stringify({motion,crowded}),'application/json');
  for(const [name,selector] of Object.entries(panels)){
    const handle=page.getByRole('separator',{name:`Resize ${name} pane`,exact:true}),pane=page.locator(selector),before=(await pane.boundingBox()).width;
    const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+150;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-32,y,{steps:8});await page.mouse.up();await saved(page);
    await expect.poll(async()=>(await pane.boundingBox()).width).toBeCloseTo(before+32,0);await columns(page);
  }
  const originalWidths=await page.locator('.right-panes .sheet-dock').evaluateAll(panes=>panes.map(pane=>pane.getBoundingClientRect().width));
  const aiHandle=page.getByRole('separator',{name:'Resize AI pane',exact:true}),box=await aiHandle.boundingBox(),x=box.x+box.width/2,y=box.y+150;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-16,y,{steps:6});await page.keyboard.press('Escape');await page.mouse.up();await saved(page);
  await expect.poll(()=>page.locator('.right-panes .sheet-dock').evaluateAll(panes=>panes.map(pane=>pane.getBoundingClientRect().width))).toEqual(originalWidths);
  const vaultHandle=page.getByRole('separator',{name:'Resize Vault pane',exact:true}),vaultBox=await vaultHandle.boundingBox();
  await page.mouse.move(vaultBox.x+vaultBox.width/2,vaultBox.y+150);await page.mouse.down();await page.mouse.move(vaultBox.x+vaultBox.width/2-16,vaultBox.y+150,{steps:4});
  await page.evaluate(()=>document.querySelector('.toolbar-right button[aria-label="Vault"]').click());
  await page.mouse.up();await expect(page.locator('[data-vault-panel]')).toHaveCount(0);await saved(page);
  await page.getByRole('button',{name:'Vault',exact:true}).click();await saved(page);
  await expect(vaultHandle).toHaveAttribute('aria-disabled','false');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.style.cursor)).not.toBe('col-resize');
  await expect.poll(()=>page.locator('.right-panes .sheet-dock').evaluateAll(panes=>panes.map(pane=>pane.getBoundingClientRect().width))).toEqual(originalWidths);
  await vaultHandle.press('ArrowLeft');await saved(page);
  const finalWidths=await page.locator('.right-panes .sheet-dock').evaluateAll(panes=>panes.map(pane=>pane.getBoundingClientRect().width));
  await page.reload();await saved(page);
  await expect.poll(()=>page.locator('.right-panes .sheet-dock').evaluateAll(panes=>panes.map(pane=>pane.getBoundingClientRect().width))).toEqual(finalWidths);
  await columns(page);const after=await repositorySnapshot(page);assert.equal(after.head,source.head);assert.deepEqual(after.commits,source.commits);
});

Then('History and Git dividers remain interactive after development hot updates with {string} motion',{timeout:180000},async function(motion){
  const page=this.page;await page.emulateMedia({reducedMotion:motion});await page.setViewportSize({width:2200,height:1040});
  await page.getByRole('button',{name:'Open History',exact:true}).click();await page.getByRole('button',{name:'Git operations',exact:true}).click();await saved(page);
  for(const name of ['History','Git'])await expect(page.getByRole('separator',{name:`Resize ${name} pane`,exact:true})).toHaveAttribute('aria-disabled','false');
  const source=await repositorySnapshot(page),token=`pane-${Date.now()}`;
  await this.updateDevelopmentPane(token);
  await expect(page.locator('[data-history-panel]')).toBeVisible();
  await expect.poll(()=>page.locator('[data-history-panel]').evaluate(pane=>pane.closest('.sheet-pane').dataset.browserPaneGeneration)).toBe(token);
  await page.getByRole('button',{name:'AI chat',exact:true}).click();await page.getByRole('button',{name:'Vault',exact:true}).click();await saved(page);
  await page.locator('.app-shell').evaluate(async shell=>{for(let i=0;i<90;i++){await new Promise(resolve=>requestAnimationFrame(resolve));if(!shell.getAnimations({subtree:true}).some(animation=>animation.playState==='running'&&animation.effect?.target?.matches('.sheet-dock, .docked-content, .explorer-dock, .sidebar')))return;}throw new Error('Pane motion did not finish');});
  const diagnostics=await page.locator('.right-panes .width-divider').evaluateAll(handles=>handles.map(handle=>{
    const r=handle.getBoundingClientRect(),x=r.x+4.5,y=r.y+r.height*.8,hit=document.elementFromPoint(x,y);
    return {name:handle.getAttribute('aria-label'),disabled:handle.getAttribute('aria-disabled'),moving:handle.closest('.sheet-pane').dataset.paneMoving,inert:Boolean(handle.closest('[inert]')),pointerEvents:getComputedStyle(handle).pointerEvents,hit:hit?.tagName+'.'+hit?.className,receivesPointer:hit===handle};
  }));
  await mkdir(this.artifactDirectory,{recursive:true});await writeFile(`${this.artifactDirectory}/divider-hit-testing.json`,JSON.stringify(diagnostics,null,2));await this.attach(JSON.stringify(diagnostics),'application/json');
  for(const name of ['History','Git','AI','Vault']){
    const handle=page.getByRole('separator',{name:`Resize ${name} pane`,exact:true});await expect(handle).toHaveAttribute('aria-disabled','false');
    const box=await handle.boundingBox(),x=box.x+4.5,y=box.y+box.height*.8;
    await page.mouse.move(x,y);await expect.poll(()=>handle.evaluate(node=>getComputedStyle(node,'::after').opacity)).toBe('1');
    const before=await handle.evaluate(node=>node.parentElement.getBoundingClientRect().width);
    await page.mouse.down();await page.mouse.move(x-16,y,{steps:6});await page.mouse.up();await saved(page);
    await expect.poll(()=>handle.evaluate(node=>node.parentElement.getBoundingClientRect().width)).toBeCloseTo(before+16,0);
  }
  // Replace the shared component again while History is leaving, then reopen.
  await page.getByRole('button',{name:'Open History',exact:true}).click();
  await this.updateDevelopmentPane(`${token}-interrupted`);
  await expect.poll(()=>page.locator('[data-git-panel]').evaluate(pane=>pane.closest('.sheet-pane').dataset.browserPaneGeneration)).toBe(`${token}-interrupted`);
  await page.getByRole('button',{name:'Open History',exact:true}).click();await saved(page);
  for(const name of ['History','Git','AI','Vault']){
    const handle=page.getByRole('separator',{name:`Resize ${name} pane`,exact:true});await expect(handle).toHaveAttribute('aria-disabled','false');
    const box=await handle.boundingBox();await page.mouse.move(box.x+4.5,box.y+box.height*.8);
    await expect.poll(()=>handle.evaluate(node=>getComputedStyle(node,'::after').opacity)).toBe('1');
  }
  const after=await repositorySnapshot(page);assert.equal(after.head,source.head);assert.deepEqual(after.commits,source.commits);
});

Then('already-stuck History and Git dividers recover through the actual implementation upgrade',{timeout:180000},async function(){
  const page=this.page;await page.setViewportSize({width:2000,height:1000});
  const generation=()=>page.locator('.right-panes .sheet-pane').first().getAttribute('data-browser-pane-generation');
  await this.replaceDevelopmentPaneImplementation(true,'legacy');await expect.poll(generation).toBe('legacy');
  await page.reload();await saved(page);
  await page.getByRole('button',{name:'Open History',exact:true}).click();await page.getByRole('button',{name:'Git operations',exact:true}).click();await saved(page);
  const handles=['History','Git'].map(name=>page.getByRole('separator',{name:`Resize ${name} pane`,exact:true}));
  for(const handle of handles)await expect(handle).toHaveAttribute('aria-disabled','false');
  await this.updateDevelopmentPane('stuck');await expect.poll(generation).toBe('stuck');
  for(const handle of handles)await expect(handle).toHaveAttribute('aria-disabled','true');
  await this.replaceDevelopmentPaneImplementation(false,'upgraded');await expect.poll(generation).toBe('upgraded');
  for(const handle of handles){
    await expect(handle).toHaveAttribute('aria-disabled','false');
    const box=await handle.boundingBox(),x=box.x+4.5,y=box.y+box.height*.8;
    await page.mouse.move(x,y);await expect.poll(()=>handle.evaluate(node=>getComputedStyle(node,'::after').opacity)).toBe('1');
    const before=await handle.evaluate(node=>node.parentElement.getBoundingClientRect().width);
    await page.mouse.down();await page.mouse.move(x-16,y,{steps:6});await page.mouse.up();await saved(page);
    await expect.poll(()=>handle.evaluate(node=>node.parentElement.getBoundingClientRect().width)).toBeCloseTo(before+16,0);
  }
});

Then('Settings slides after Resources and preserves the editor resize and scroll with {string} motion',{timeout:90000},async function(motion){
  const page=this.page;await page.emulateMedia({reducedMotion:motion});await openAll(page,2800);
  for(const name of ['Vault','Resources','Settings'])await page.getByRole('button',{name,exact:true}).click();
  await saved(page);await columns(page);
  const settings=page.locator('[data-settings-panel]'),body=page.locator('#panel-settings');
  const divider=page.getByRole('separator',{name:'Resize Settings pane',exact:true});
  await expect(divider).toHaveAttribute('aria-disabled','false');
  const bounds=await settings.boundingBox(),resources=await page.locator('[data-resources-panel]').boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(resources.x+resources.width-1);expect(bounds.x+bounds.width).toBeCloseTo(2800,0);
  const handle=await divider.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2+40,handle.y+handle.height/2,{steps:5});await page.mouse.up();await saved(page);
  await expect.poll(async()=>(await settings.boundingBox()).width).toBeCloseTo(bounds.width-40,0);
  const width=(await settings.boundingBox()).width;
  await body.evaluate(node=>node.scrollTop=240);await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(240);
  await page.getByRole('button',{name:'Close Settings',exact:true}).click();await expect(settings).toHaveCount(0);await columns(page);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await saved(page);
  await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(240);
  await expect(divider).toHaveAttribute('aria-disabled','false');
  await page.reload();await saved(page);await columns(page);
  await expect.poll(async()=>(await settings.boundingBox()).width).toBeCloseTo(width,0);
  await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(240);
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/settings-pane.png`});
  for(const viewport of [1280,600,320]){
    await page.setViewportSize({width:viewport,height:900});await columns(page);await saved(page);await expect(settings).toBeVisible();
    if(viewport===600){
      await writeFile(`${this.artifactDirectory}/settings-overflow.json`,JSON.stringify(await body.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,overflow:[...node.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>node.getBoundingClientRect().right+2).slice(0,15).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,100)}))})),null,2));
      await page.screenshot({path:`${this.artifactDirectory}/settings-pane-narrow.png`});
    }
    await expect(divider).toHaveAttribute('aria-disabled','false');
  }
  await expect(page.locator('[data-resources-panel]')).toHaveCount(0);
  await page.getByRole('button',{name:'Close Settings',exact:true}).click();await expect(settings).toHaveCount(0);await columns(page);
});
Then('Settings and file keyboard undo redo stay independent in adjacent panes',async function(){
  const page=this.page;await page.setViewportSize({width:1800,height:900});
  await page.getByRole('button',{name:'Settings',exact:true}).click();await saved(page);await selectSettingsTab(page,'Editor');
  const input=page.getByLabel('Code editor document',{exact:true}),wrapping=page.getByRole('switch',{name:'Line wrapping',exact:true});
  await expect(input).toBeVisible();await wrapping.check();await saved(page);
  await input.fill('file change');await saved(page);
  const heading=page.locator('[data-settings-panel] [data-pane-heading]');
  await heading.focus();await page.keyboard.press('Control+z');await saved(page);
  await expect(wrapping).not.toBeChecked();await expect(input).toHaveText('file change');
  await heading.focus();await page.keyboard.press('Control+Shift+z');await saved(page);
  await expect(wrapping).toBeChecked();await expect(input).toHaveText('file change');
  await input.focus();await page.keyboard.press('Control+z');await saved(page);
  await expect(input).toHaveText('');await expect(wrapping).toBeChecked();
  await page.getByRole('button',{name:'Redo',exact:true}).click();await saved(page);
  await expect(input).toHaveText('file change');await expect(wrapping).toBeChecked();
  await page.getByRole('button',{name:'Undo settings',exact:true}).click();await saved(page);
  await expect(wrapping).not.toBeChecked();await expect(input).toHaveText('file change');
  await selectSettingsTab(page,'Controls');
  for(const [name,shortcut] of [['Open editor','Control+Alt+e'],['Open settings','Control+Alt+s']]){
    const field=page.getByLabel(`${name} shortcut 1`,{exact:true});await field.focus();await field.press(shortcut);await saved(page);
  }
  await heading.focus();await page.keyboard.press('Control+Alt+e');await expect(input).toBeFocused();
  await page.keyboard.press('Control+Alt+s');await expect(heading).toBeFocused();await expect(input).toBeVisible();
});
