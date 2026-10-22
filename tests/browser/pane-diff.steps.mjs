// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then,When} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const columns=page=>page.locator('.editor-document > .primary-pane, .editor-document > .split-editor');
Then('there are {int} editor pane columns',async function(count){await expect(columns(this.page)).toHaveCount(count);});
Then('viewport {int} has a comparison tab named {string} showing {string}',async function(index,label,text){
  const tabs=this.page.locator('.editor-tabs > .file-tabs').nth(index-1);
  await expect(tabs.getByRole('button',{name:`${index===1?'Switch to':'Focus split file'} ${label}`,exact:true})).toBeVisible();
  const pane=columns(this.page).nth(index-1),diff=pane.getByRole('region',{name:'File diff',exact:true});
  await expect(diff.getByLabel('Current file',{exact:true})).toHaveText(text);
  await expect(diff).toHaveAttribute('aria-busy','false');
  const bounds=await pane.boundingBox(),comparison=await diff.boundingBox();
  const inset=await pane.evaluate(node=>({left:parseFloat(getComputedStyle(node).borderLeftWidth),right:parseFloat(getComputedStyle(node).borderRightWidth)}));
  expect(Math.abs(bounds.x+inset.left-comparison.x)).toBeLessThan(1);expect(Math.abs(bounds.width-inset.left-inset.right-comparison.width)).toBeLessThan(1);
});
When('I close comparison tab {string} in viewport {int}',async function(label,index){
  await this.page.locator('.editor-tabs > .file-tabs').nth(index-1).getByRole('button',{name:`Close ${index===1?'':'split file '}${label}`,exact:true}).click();
});
When('I close primary tab {string}',async function(label){await this.page.getByRole('button',{name:`Close ${label}`,exact:true}).click();});
Then('the primary comparison is hidden',async function(){await expect(columns(this.page).first().getByRole('region',{name:'File diff',exact:true})).toHaveCount(0);});

Then('the comparison divider resizes both columns and cancels unfinished dragging',async function(){
  const diff=this.page.getByRole('region',{name:'File diff',exact:true});
  await expect(diff).toHaveAttribute('aria-busy','false');
  const divider=diff.getByRole('separator'),left=diff.locator('.cm-mergeViewEditor').first();
  const initial=(await left.boundingBox()).width;
  await left.evaluate(node=>{window.__resizedDiffEditor=node.querySelector('.cm-editor');});
  const box=await divider.boundingBox();
  await this.page.mouse.move(box.x+2,box.y+40);await this.page.mouse.down();
  await this.page.mouse.move(box.x+52,box.y+40,{steps:5});await this.page.mouse.up();
  await expect.poll(async()=>(await left.boundingBox()).width).toBeCloseTo(initial+50,0);
  const resized=(await left.boundingBox()).width;
  await divider.focus();await divider.press('ArrowLeft');
  await expect.poll(async()=>(await left.boundingBox()).width).toBeCloseTo(resized-16,0);
  const beforeCancel=(await left.boundingBox()).width,again=await divider.boundingBox();
  await this.page.mouse.move(again.x+2,again.y+40);await this.page.mouse.down();
  await this.page.mouse.move(again.x-25,again.y+40,{steps:3});await this.page.keyboard.press('Escape');await this.page.mouse.up();
  await expect.poll(async()=>(await left.boundingBox()).width).toBeCloseTo(beforeCancel,0);
  expect(await left.evaluate(node=>node.querySelector('.cm-editor')===window.__resizedDiffEditor)).toBe(true);
});

Then('comparison viewport {int} saves edits with undo redo while the old side stays read only',async function(index){
  const pane=columns(this.page).nth(index-1),diff=pane.getByRole('region',{name:'File diff',exact:true});
  const current=diff.getByLabel('Current file',{exact:true}),old=diff.getByLabel('Committed file',{exact:true});
  await expect(diff).toHaveAttribute('aria-busy','false');
  await expect(current).toHaveAttribute('contenteditable','true');await expect(old).toHaveAttribute('contenteditable','false');
  const baseline=await old.textContent();
  await this.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(diff.locator('[data-diff-motion]')).toHaveCount(0);
  await diff.evaluate(node=>{
    window.__editingDiffNodes=[...node.querySelectorAll('.cm-merge-a, .cm-merge-b')];window.__editingDiffMotions=0;
    window.__editingDiffObserver=new MutationObserver(records=>{for(const record of records)for(const added of record.addedNodes)
      if(added instanceof Element&&(added.matches('[data-diff-motion]')||added.querySelector('[data-diff-motion]')))window.__editingDiffMotions++;});
    window.__editingDiffObserver.observe(node,{childList:true,subtree:true});
  });
  await current.focus();await this.page.keyboard.press('ControlOrMeta+End');await this.page.keyboard.type(' edited');
  await expect(current).toHaveText('Second root file edited');
  await expect(this.page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await expect(old).toHaveText(baseline);
  await expect(current.locator('.cm-activeLine')).toHaveCount(1);
  await expect(diff.locator('.cm-merge-b .cm-activeLineGutter')).not.toHaveCount(0);
  const stable=await diff.evaluate(node=>{
    return {motions:window.__editingDiffMotions,same:[...node.querySelectorAll('.cm-merge-a, .cm-merge-b')].every((editor,index)=>editor===window.__editingDiffNodes[index])};
  });
  expect(stable,JSON.stringify(stable)).toMatchObject({motions:0,same:true});
  // Continuous typing on one row is a single durable undo group.
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await expect(current).toHaveText('Second root file');
  await this.page.getByRole('button',{name:'Redo',exact:true}).click();await expect(current).toHaveText('Second root file edited');
  await expect(diff).toHaveAttribute('aria-busy','false');
  await this.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await diff.evaluate(()=>{window.__editingDiffObserver.disconnect();return window.__editingDiffMotions;})).toBe(0);
  expect(await diff.evaluate(node=>[...node.querySelectorAll('.cm-merge-a, .cm-merge-b')].every((editor,index)=>editor===window.__editingDiffNodes[index]))).toBe(true);
  await expect(diff.locator('.diff-editors')).toBeVisible();


  await this.page.reload();await expect(current).toHaveText('Second root file edited');await expect(old).toHaveText(baseline);
});
