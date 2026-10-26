// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const panes='.editor-document > .code-editor, .editor-document > .split-editor';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const widths=page=>page.locator(panes).evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().width));
const divider=(page,index)=>page.getByRole('separator',{name:`Resize editor panes ${index} and ${index+1}`,exact:true});
const expectWidths=async(page,expected)=>{
  await expect.poll(async()=>{
    const actual=await widths(page);
    return actual.length===expected.length&&actual.every((width,index)=>Math.abs(width-expected[index])<1);
  }).toBe(true);
};
const revisions=async page=>(await repositoryHistories(page)).edits.length;
When('I drag editor divider {int} by {int} pixels',async function(index,delta){
  await saved(this.page);
  this.resizeBefore=await widths(this.page);this.resizeDivider=index;
  this.resizeRevisions=await revisions(this.page);
  const handle=await divider(this.page,index).boundingBox();
  await this.page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
  await this.page.mouse.down();
  await this.page.mouse.move(handle.x+handle.width/2+delta,handle.y+handle.height/2,{steps:12});
  await this.page.mouse.up();await saved(this.page);
  this.resizeAfter=await widths(this.page);
});
Then('the adjacent panes have resized by {int} pixels with aligned tabs and minimaps',async function(delta){
  const expected=this.resizeBefore.map((width,index)=>width+(index===this.resizeDivider-1?delta:index===this.resizeDivider?-delta:0));
  await expectWidths(this.page,expected);
  const geometry=await this.page.locator(panes).evaluateAll(elements=>elements.map((element,index)=>{
    const box=element.getBoundingClientRect(),tabs=document.querySelectorAll('.editor-tabs > .file-tabs')[index].getBoundingClientRect();
    const map=element.querySelector('.cm-minimap-gutter').getBoundingClientRect();
    return {width:box.width,tabsWidth:tabs.width,x:box.x,tabsX:tabs.x,right:box.right,mapRight:map.right,mapLeft:map.left,mapVisible:map.width>0};
  }));
  for(const pane of geometry){
    expect(Math.abs(pane.width-pane.tabsWidth)).toBeLessThan(1);
    expect(Math.abs(pane.x-pane.tabsX)).toBeLessThan(1);
    if(pane.mapVisible){
      expect(pane.right-pane.mapRight).toBeGreaterThanOrEqual(0);
      expect(pane.right-pane.mapRight).toBeLessThan(16);
      expect(pane.mapLeft).toBeGreaterThan(pane.x);
    }
  }
  await expect(this.page.locator('[data-split-motion]')).toHaveCount(0);
});
Then('the resized pane widths are restored',async function(){await saved(this.page);await expectWidths(this.page,this.resizeAfter);});
Then('the pane widths before the drag are restored',async function(){await saved(this.page);await expectWidths(this.page,this.resizeBefore);});
Then('resizing has not added a file revision',async function(){expect(await revisions(this.page)).toBe(this.resizeRevisions);});
Then('all resized panes scroll independently',async function(){
  const scrolls=this.page.locator('.editor-document .cm-scroller');
  for(let index=0;index<3;index++){
    const before=await scrolls.evaluateAll(elements=>elements.map(element=>element.scrollTop));
    const scroll=scrolls.nth(index),box=await scroll.boundingBox();
    await this.page.mouse.move(box.x+box.width/3,box.y+box.height/2);await this.page.mouse.wheel(0,250);
    await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(before[index]+100);
    const after=await scrolls.evaluateAll(elements=>elements.map(element=>element.scrollTop));
    for(let other=0;other<3;other++)if(other!==index)expect(after[other]).toBe(before[other]);
  }
});
Then('the remaining panes fill the available width',async function(){
  const layout=await this.page.locator('.editor-document').evaluate(element=>({available:element.clientWidth,
    widths:[...element.children].map(child=>child.getBoundingClientRect().width)}));
  expect(Math.abs(layout.widths.reduce((sum,width)=>sum+width,0)+2*(layout.widths.length-1)-layout.available)).toBeLessThan(1);
});
Then('editor dividers support keyboard resizing and minimum widths',async function(){
  const handle=divider(this.page,1);await handle.focus();
  const before=await widths(this.page);await this.page.keyboard.press('ArrowRight');await saved(this.page);
  await expectWidths(this.page,[before[0]+16,before[1]-16]);
  await this.page.keyboard.press('Home');await saved(this.page);
  let actual=await widths(this.page);expect(Math.abs(actual[0]-160)).toBeLessThan(1);
  await this.page.keyboard.press('End');await saved(this.page);
  actual=await widths(this.page);expect(Math.abs(actual[1]-160)).toBeLessThan(1);
  await expect(handle).toBeFocused();
});
Then('cancelling a divider drag restores its starting widths',async function(){
  const before=await widths(this.page),handle=await divider(this.page,1).boundingBox();
  await this.page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await this.page.mouse.down();
  await this.page.mouse.move(handle.x+handle.width/2-80,handle.y+handle.height/2,{steps:8});
  await expect.poll(async()=>Math.abs((await widths(this.page))[0]-before[0])).toBeGreaterThan(40);
  await this.page.keyboard.press('Escape');await this.page.mouse.up();
  await expectWidths(this.page,before);
  expect(await this.page.evaluate(()=>document.documentElement.style.cursor)).toBe('');
});
