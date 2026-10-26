// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {openStagedHistory} from './navigation.helpers.mjs';
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {repositorySnapshot} from './repository-snapshot.helpers.mjs';

const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const pane=(page,name)=>page.locator(name==='History'?'[data-history-panel]':name==='Git'?'[data-git-panel]':'[data-ollama-panel]');
const divider=(page,name)=>page.getByRole('separator',{name:`Resize ${name} pane`,exact:true});
const width=(page,name)=>pane(page,name).evaluate(element=>Math.round(element.getBoundingClientRect().width));
async function drag(page,name,delta){
 const handle=divider(page,name);await expect(handle).toHaveAttribute('aria-disabled','false');
 const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+100;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-delta,y,{steps:10});await page.mouse.up();await saved(page);
}

Then('crowded History and Git panes remain draggable after inspecting the current commit with {string} motion',{timeout:90000},async function(motion){
 const page=this.page;await page.setViewportSize({width:2600,height:1000});await page.emulateMedia({reducedMotion:motion});
 await openStagedHistory(page);
 await page.getByRole('button',{name:'Git operations',exact:true}).click();
 await page.getByRole('button',{name:'AI chat',exact:true}).click();await saved(page);
 for(const [name,target]of [['History',760],['Git',660]]){
  await expect(divider(page,name)).toHaveAttribute('aria-disabled','false');
  await drag(page,name,target-await width(page,name));await expect.poll(()=>width(page,name)).toBe(target);
 }
 const original=await repositorySnapshot(page);
 await page.setViewportSize({width:2048,height:1000});await saved(page);
 await pane(page,'Git').getByRole('button',{name:'Commits',exact:true}).click();
 await pane(page,'Git').getByRole('button',{name:/Current source commit/}).click();
 const checkout=pane(page,'Git').getByRole('button',{name:'Check out commit',exact:true});await expect(checkout).toBeVisible();
 await expect(checkout).toBeDisabled();await expect(pane(page,'Git')).toBeVisible();
 await pane(page,'Git').getByRole('button',{name:'Actions',exact:true}).click();
 await expect(page.getByRole('button',{name:'Git target',exact:true})).toHaveAttribute('data-value','refs/heads/main');
 const merge=pane(page,'Git').getByRole('button',{name:'Merge branch',exact:true});
 await merge.click();await expect(merge).toBeEnabled();await saved(page);await expect(pane(page,'Git')).toBeVisible();
 await expect(pane(page,'Git').getByRole('alert')).toHaveCount(0);
 await pane(page,'Git').getByRole('button',{name:'Close',exact:true}).click();await expect(pane(page,'Git')).toHaveCount(0);await saved(page);
 await page.getByRole('button',{name:'Git operations',exact:true}).click();await saved(page);
 // Cancellation must restore the larger saved preferences, not persist the
 // clamped widths merely because this viewport has less room.
 await page.locator('.work-area').evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
 const clamped=await width(page,'History'),handle=divider(page,'History');await expect(handle).toHaveAttribute('aria-disabled','false');
 const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+100;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+40,y,{steps:8});
 await expect.poll(()=>width(page,'History')).toBeLessThan(clamped-30);
 await page.keyboard.press('Escape');await page.mouse.up();await expect.poll(()=>width(page,'History')).toBe(clamped);
 await page.setViewportSize({width:2600,height:1000});
 await expect.poll(()=>width(page,'History')).toBe(760);await expect.poll(()=>width(page,'Git')).toBe(660);
 await page.setViewportSize({width:2048,height:1000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const finalWidths={};
 for(const name of ['History','Git']){
  const before=await width(page,name);
  const neighbours=await Promise.all(['History','Git','AI'].filter(other=>other!==name).map(async other=>[other,await width(page,other)]));
  await drag(page,name,-60);
  const after=await width(page,name);
  const diagnostic=await divider(page,name).evaluate(element=>({disabled:element.getAttribute('aria-disabled'),pointerEvents:getComputedStyle(element).pointerEvents,tabDragging:document.documentElement.dataset.tabDragging??null,minimum:element.getAttribute('aria-valuemin'),maximum:element.getAttribute('aria-valuemax')}));
  await this.attach(JSON.stringify({name,before,after,...diagnostic}),'application/json');
  assert.equal(after,before-60,`${name} must follow its divider throughout the drag: ${JSON.stringify({before,after,...diagnostic})}`);
  for(const [other,previous]of neighbours)assert.equal(await width(page,other),previous,`${other} must stay still while resizing ${name}`);
  await divider(page,name).focus();await divider(page,name).press('ArrowRight');await saved(page);await expect.poll(()=>width(page,name)).toBe(after-16);
  await divider(page,name).press('ArrowLeft');await saved(page);await expect.poll(()=>width(page,name)).toBe(after);
  finalWidths[name]=after;
 }
 const aiBefore=await width(page,'AI');await drag(page,'AI',-20);await expect.poll(()=>width(page,'AI')).toBe(aiBefore-20);finalWidths.AI=aiBefore-20;
 await page.reload();await saved(page);
 for(const [name,value]of Object.entries(finalWidths))await expect.poll(()=>width(page,name)).toBe(value);
 const current=await repositorySnapshot(page);
 assert.equal(current.head,original.head);assert.deepEqual(current.commits.map(commit=>commit.oid),original.commits.map(commit=>commit.oid));
 assert.deepEqual(current.history.map(change=>change.oid),original.history.map(change=>change.oid));
});
