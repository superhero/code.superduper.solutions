// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
Then('the minimap navigates a long document without editing it',async function(){
  const content=this.page.getByLabel('Code editor document',{exact:true});
  this.minimapSource=Array.from({length:250},(_,index)=>`const value${index} = ${index};`).join('\n');
  await content.click();await this.page.keyboard.insertText(this.minimapSource);await saved(this.page);
  await this.page.keyboard.press('Control+Home');
  const history=async()=>(await repositoryHistories(this.page)).edits;
  const before=await history();
  const map=this.page.getByRole('group',{name:'Document minimap',exact:true});await expect(map).toBeVisible();
  const colors=await map.evaluate(element=>{
    const sample=document.createElement('span');sample.style.backgroundColor='color-mix(in srgb, var(--color-surface) 20%, var(--color-background))';element.append(sample);
    const expected=getComputedStyle(sample).backgroundColor;sample.remove();
    return{map:getComputedStyle(element).backgroundColor,expected,editor:getComputedStyle(element.closest('.cm-editor')).backgroundColor};
  });
  assert.equal(colors.map,colors.expected);assert.notEqual(colors.map,colors.editor);
  const canvas=map.locator('canvas');await expect(canvas).toBeVisible();
  const bounds=await map.boundingBox(),editor=await this.page.locator('.cm-editor').boundingBox();assert.ok(bounds&&editor);
  assert.ok(bounds.x>editor.x+editor.width/2);assert.ok(Math.abs(bounds.x+bounds.width-editor.x-editor.width)<15);
  const scroll=this.page.locator('.cm-editor > .cm-scroller');
  await this.page.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(300);
  await map.focus();await this.page.keyboard.press('Home');await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBe(0);
  const overlay=map.locator('.cm-minimap-overlay'),box=await overlay.boundingBox();assert.ok(box);
  await this.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await this.page.mouse.down();await this.page.mouse.move(box.x+box.width/2,box.y+box.height/2+60,{steps:6});await this.page.mouse.up();
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(100);
  await map.focus();await this.page.keyboard.press('Home');await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBe(0);
  const grabX=bounds.x+bounds.width/2,grabY=bounds.y+bounds.height/2;
  await this.page.mouse.move(grabX,grabY);await this.page.mouse.down();
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(300);
  const pressed=await scroll.evaluate(element=>element.scrollTop);
  await this.page.mouse.move(grabX,grabY+50,{steps:6});
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(pressed+50);
  // Keep dragging outside the minimap, then release without another jump.
  await this.page.mouse.move(bounds.x-30,grabY-30,{steps:6});
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeLessThan(pressed);
  await this.page.mouse.up();const released=await scroll.evaluate(element=>element.scrollTop);
  await this.page.mouse.move(grabX,grabY+70);assert.equal(await scroll.evaluate(element=>element.scrollTop),released);
  await map.focus();await this.page.keyboard.press('End');
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop+element.clientHeight>=element.scrollHeight-2)).toBe(true);
  await this.page.keyboard.press('Control+Home');
  assert.deepEqual(await history(),before);
  const overflow=await this.page.locator('.cm-editor').evaluate(element=>({height:element.clientHeight,scroll:element.scrollHeight,overflow:getComputedStyle(element).overflowY}));
  assert.equal(overflow.overflow,'hidden');
});
Then('the minimap can be disabled and restored in Editor details',async function(){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  const toggle=this.page.getByRole('switch',{name:'Minimap',exact:true});await expect(toggle).toBeChecked();await toggle.click();await saved(this.page);
  await selectPage(this.page,'Editor');await expect(this.page.getByRole('group',{name:'Document minimap',exact:true})).toHaveCount(0);
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(this.page.getByRole('group',{name:'Document minimap',exact:true})).toHaveCount(0);
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');await expect(toggle).not.toBeChecked();await toggle.click();await saved(this.page);
  await selectPage(this.page,'Editor');await expect(this.page.getByRole('group',{name:'Document minimap',exact:true})).toBeVisible();
});

async function checkSyntaxColors(page){
  const content=page.getByLabel('Code editor document',{exact:true});
  await expect(content.locator('.cm-line').first().getByText('const',{exact:true}).first()).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>{
    const content=document.querySelector('.cm-content'),canvas=document.querySelector('.cm-minimap-inner canvas');
    if(!canvas)return false;
    const values=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,colors=new Set();
    for(let index=0;index<values.length;index+=4)if(values[index+3]>=150)colors.add(`${values[index]},${values[index+1]},${values[index+2]}`);
    const spans=[...content.querySelector('.cm-line').querySelectorAll('span')];
    return ['const','"value"','123'].every(text=>{
      const span=spans.find(span=>span.textContent===text);if(!span)return false;
      const color=getComputedStyle(span).color.match(/[\d.]+/g).slice(0,3).map(Number);
      // Canvas blocks use partial alpha; unpremultiplication can round by 1–2.
      return [...colors].some(pixel=>pixel.split(',').every((channel,index)=>Math.abs(Number(channel)-color[index])<=2));
    });
  })).toBe(true);
}
Then('minimap pixels use the editor syntax colors',async function(){
  const content=this.page.getByLabel('Code editor document',{exact:true});
  await content.click();await this.page.keyboard.insertText(Array.from({length:30},(_,index)=>`const sample${index} = "value"; const number${index} = 123; // comment`).join('\n'));await saved(this.page);
  await this.page.keyboard.press('Control+Home');await checkSyntaxColors(this.page);
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await checkSyntaxColors(this.page);
});
Then('minimap pixels follow a palette change',async function(){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');await selectDropdown(this.page,'Palette','bonfire');await saved(this.page);
  await selectPage(this.page,'Editor');await checkSyntaxColors(this.page);
});
