// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from 'node:assert/strict';
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';

const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const editors=page=>page.locator('.editor-document .cm-editor');
const positions=page=>editors(page).locator(':scope > .cm-scroller').evaluateAll(elements=>elements.map(element=>element.scrollTop));
const history=async page=>(await repositoryHistories(page)).edits;
const top=scroll=>scroll.evaluate(element=>element.scrollTop);
const settledAt=(scroll,expected)=>expect.poll(async()=>Math.abs(await top(scroll)-expected)).toBeLessThanOrEqual(1);
const reset=scroll=>scroll.evaluate(async element=>{
  element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));element.scrollTop=0;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
});
async function othersStay(page,before,index){
  const after=await positions(page);
  for(let pane=0;pane<after.length;pane++)if(pane!==index)assert.equal(after[pane],before[pane],`Navigating pane ${index+1} moved pane ${pane+1}`);
}

When('I set minimap scroll speed to {float} with smoothing {word} and motion {word}',async function(speed,smoothing,motion){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  const slider=this.page.getByRole('slider',{name:'Scroll speed',exact:true});
  await slider.evaluate((element,value)=>{element.value=String(value);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));},speed);
  await this.page.getByRole('switch',{name:'Smooth scrolling',exact:true}).setChecked(smoothing==='enabled');await saved(this.page);
  await selectPage(this.page,'Editor');await this.page.emulateMedia({reducedMotion:motion==='reduced'?'reduce':'no-preference'});
  this.minimapPreferences={speed,smooth:smoothing==='enabled'&&motion!=='reduced'};
});

Then('minimap navigation keys honor those preferences in all three panes',{timeout:60000},async function(){
  const panes=editors(this.page);await expect(panes).toHaveCount(3);
  const beforeHistory=await history(this.page);
  const {speed,smooth}=this.minimapPreferences;
  for(let index=0;index<3;index++){
    const pane=panes.nth(index),scroll=pane.locator(':scope > .cm-scroller'),map=pane.getByRole('group',{name:'Document minimap',exact:true});
    await reset(scroll);const before=await positions(this.page);
    const {line,height,max}=await scroll.evaluate(element=>({line:parseFloat(getComputedStyle(element.querySelector('.cm-content')).lineHeight),height:element.clientHeight,max:element.scrollHeight-element.clientHeight}));
    await map.focus();
    const immediate=await map.evaluate(element=>{element.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));return element.closest('.cm-scroller').scrollTop;});
    const lineTarget=Math.min(max,line*speed);
    if(smooth)assert.equal(immediate,0,`Pane ${index+1} should ease keyboard navigation`);
    else assert.ok(Math.abs(immediate-lineTarget)<=1,`Pane ${index+1} should navigate immediately`);
    await settledAt(scroll,lineTarget);
    await this.page.keyboard.press('ArrowUp');await settledAt(scroll,0);
    await this.page.keyboard.press('PageDown');await settledAt(scroll,Math.min(max,height*speed));
    await this.page.keyboard.press('PageUp');await settledAt(scroll,0);
    await this.page.keyboard.press('End');await settledAt(scroll,max);
    await this.page.keyboard.press('Home');await settledAt(scroll,0);
    await othersStay(this.page,before,index);
  }
  assert.deepEqual(await history(this.page),beforeHistory,'Minimap navigation must not edit a file or add history actions');
});

Then('minimap clicks and continued drags navigate each pane independently',{timeout:60000},async function(){
  const panes=editors(this.page);await expect(panes).toHaveCount(3);
  for(let index=0;index<3;index++){
    const pane=panes.nth(index),scroll=pane.locator(':scope > .cm-scroller'),map=pane.getByRole('group',{name:'Document minimap',exact:true});
    await reset(scroll);const before=await positions(this.page),bounds=await map.boundingBox();assert.ok(bounds);
    const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height*.4;
    // A click outside the thumb becomes a continuous drag without another press.
    await this.page.mouse.move(x,y);await this.page.mouse.down();
    await expect.poll(()=>top(scroll)).toBeGreaterThan(300);
    await scroll.evaluate(async()=>{for(let frame=0;frame<20;frame++)await new Promise(resolve=>requestAnimationFrame(resolve));});
    const pressed=await top(scroll);
    await this.page.mouse.move(x,y+35,{steps:5});await expect.poll(()=>top(scroll)).toBeGreaterThan(pressed+100);
    await this.page.mouse.move(bounds.x-20,y-30,{steps:5});await expect.poll(()=>top(scroll)).toBeLessThan(pressed);
    await this.page.mouse.up();const released=await top(scroll);
    await this.page.mouse.move(x,y+60);
    await scroll.evaluate(()=>new Promise(resolve=>setTimeout(resolve,200)));
    assert.equal(await top(scroll),released,'Releasing the drag must cancel further movement and pending easing');
    await othersStay(this.page,before,index);
    // Dragging the current thumb preserves the starting position and follows the pointer.
    await reset(scroll);const overlay=await map.locator('.cm-minimap-overlay').boundingBox();assert.ok(overlay);
    await this.page.mouse.move(x,overlay.y+overlay.height/2);await this.page.mouse.down();
    assert.equal(await top(scroll),0,'Pressing the current viewport must not jump');
    await this.page.mouse.move(x,overlay.y+overlay.height/2+30,{steps:5});await this.page.mouse.up();
    await expect.poll(()=>top(scroll)).toBeGreaterThan(100);
    await othersStay(this.page,before,index);
  }
});

When('I fill the primary pane with short scrollable minimap source',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();
  await this.page.keyboard.insertText(Array.from({length:80},(_,index)=>`const short${index} = ${index};`).join('\n'));await saved(this.page);
  await this.page.keyboard.press('Control+Home');
});

Then('short document minimap drags keep the viewport beneath the pointer in all three panes',async function(){
  const panes=editors(this.page);await expect(panes).toHaveCount(3);
  for(let index=0;index<3;index++){
    const pane=panes.nth(index),scroll=pane.locator(':scope > .cm-scroller'),map=pane.getByRole('group',{name:'Document minimap',exact:true});
    const size=await scroll.evaluate(element=>({height:element.clientHeight,total:element.scrollHeight}));
    assert.ok(size.total>size.height&&size.total<size.height*8,'This fixture must scroll while its entire minimap still fits');
    await reset(scroll);const before=await positions(this.page);
    const thumb=map.locator('.cm-minimap-overlay'),box=await thumb.boundingBox();assert.ok(box);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await this.page.mouse.move(x,y);await this.page.mouse.down();
    await this.page.mouse.move(x,y+25,{steps:5});await this.page.mouse.up();
    await expect.poll(async()=>Math.abs((await thumb.boundingBox()).y+(await thumb.boundingBox()).height/2-(y+25))).toBeLessThan(2);
    assert.ok(await top(scroll)>100,'Dragging the short-document viewport should scroll its code');
    await othersStay(this.page,before,index);
  }
});

Then('toggling minimaps preserves three independent scroll positions and wheel navigation',async function(){
  const scrolls=editors(this.page).locator(':scope > .cm-scroller');
  await scrolls.evaluateAll(async elements=>{
    elements.forEach((element,index)=>{element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));element.scrollTop=Math.round((element.scrollHeight-element.clientHeight)*(index+1)/5);});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  let before=await positions(this.page);
  for(const enabled of [false,true]){
    await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
    await this.page.getByRole('switch',{name:'Minimap',exact:true}).setChecked(enabled);await saved(this.page);
    await selectPage(this.page,'Editor');
    await expect(this.page.getByRole('group',{name:'Document minimap',exact:true})).toHaveCount(enabled?3:0);
    await expect.poll(()=>positions(this.page)).toEqual(before);
    for(let index=0;index<3;index++){
      const scroll=scrolls.nth(index),others=await positions(this.page);
      await scroll.evaluate(element=>element.dispatchEvent(new WheelEvent('wheel',{deltaY:20,bubbles:true,cancelable:true})));
      await settledAt(scroll,others[index]+20*this.minimapPreferences.speed);
      await othersStay(this.page,others,index);
    }
    before=await positions(this.page);
  }
});

When('I fill the primary pane with wrapped minimap source',async function(){
  const words=Array.from({length:30},(_,index)=>`word${index}`).join(' ');
  await this.page.getByLabel('Code editor document',{exact:true}).click();
  await this.page.keyboard.insertText(Array.from({length:120},(_,index)=>`const wrapped${String(index).padStart(3,'0')} = "${words}";`).join('\n'));await saved(this.page);
  await this.page.keyboard.press('Control+Home');
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await this.page.getByRole('switch',{name:'Line wrapping',exact:true}).check();await saved(this.page);
  await selectPage(this.page,'Editor');
});

Then('clicking a wrapped minimap row reveals that logical line in each pane',async function(){
  const panes=editors(this.page);await expect(panes).toHaveCount(3);
  for(let index=0;index<3;index++){
    const pane=panes.nth(index),scroll=pane.locator(':scope > .cm-scroller'),map=pane.getByRole('group',{name:'Document minimap',exact:true});
    await reset(scroll);const before=await positions(this.page);
    const geometry=await scroll.evaluate(element=>{
      const content=element.querySelector('.cm-content'),style=getComputedStyle(content),line=parseFloat(style.lineHeight),padding=parseFloat(style.paddingTop);
      return{line,padding,height:element.clientHeight,total:element.scrollHeight};
    });
    const bounds=await map.boundingBox();assert.ok(bounds);
    assert.ok((120*geometry.line+geometry.padding)/8<bounds.height,'All logical rows must fit in the minimap');
    assert.ok(geometry.total>geometry.height*8,'Wrapped physical lines must be substantially taller than the logical minimap');
    const y=bounds.y+(geometry.padding+(48+.5)*geometry.line)/8;
    await this.page.mouse.click(bounds.x+bounds.width/2,y);
    const row=pane.locator('.cm-line').filter({hasText:'const wrapped048 = '});
    await expect(row).toHaveCount(1);
    await expect.poll(()=>row.evaluate(element=>{
      const line=element.getBoundingClientRect(),view=element.closest('.cm-scroller').getBoundingClientRect();
      return line.bottom>view.top&&line.top<view.bottom;
    })).toBe(true);
    await othersStay(this.page,before,index);
  }
});
