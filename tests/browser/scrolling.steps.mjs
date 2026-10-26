// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const scroller=page=>page.locator('.cm-editor > .cm-scroller');
async function preferences(page){await selectPage(page, 'Settings', 'Editor');await selectDropdown(page,'Settings scope','global');}
Then('editor wheel distance follows the scroll speed slider',async function(){
  const content=this.page.getByLabel('Code editor document',{exact:true});await content.click();
  await this.page.keyboard.insertText(Array.from({length:300},(_,index)=>`const line${index} = ${index};`).join('\n'));await saved(this.page);
  await preferences(this.page);
  const slider=this.page.getByRole('slider',{name:'Scroll speed',exact:true});
  await slider.evaluate(element=>{element.value='2';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(this.page.locator('output[for="setting-scrollSpeed"]')).toHaveText('2×');
  await slider.dispatchEvent('change');await saved(this.page);
  await this.page.getByRole('switch',{name:'Smooth scrolling',exact:true}).uncheck();await saved(this.page);
  await selectPage(this.page,'Editor');
  await scroller(this.page).evaluate(element=>element.scrollTop=0);
  const bounds=await scroller(this.page).boundingBox();assert.ok(bounds);
  await this.page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await this.page.mouse.wheel(0,80);
  await expect.poll(()=>scroller(this.page).evaluate(element=>element.scrollTop)).toBe(160);
});
Then('editor smooth scrolling eases movement and respects reduced motion',async function(){
  await preferences(this.page);await this.page.getByRole('switch',{name:'Smooth scrolling',exact:true}).check();await saved(this.page);
  await selectPage(this.page,'Editor');await this.page.emulateMedia({reducedMotion:'no-preference'});
  await scroller(this.page).evaluate(element=>element.scrollTop=0);
  const motion=await scroller(this.page).evaluate(async element=>{
    element.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));const start=element.scrollTop;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return{start,middle:element.scrollTop};
  });assert.equal(motion.start,0);assert.ok(motion.middle>0&&motion.middle<200,JSON.stringify(motion));
  await expect.poll(()=>scroller(this.page).evaluate(element=>element.scrollTop)).toBe(200);
  await this.page.emulateMedia({reducedMotion:'reduce'});await scroller(this.page).evaluate(element=>element.scrollTop=0);
  const immediate=await scroller(this.page).evaluate(element=>{element.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));return element.scrollTop;});assert.equal(immediate,200);
  const zoom=await scroller(this.page).evaluate(element=>{const event=new WheelEvent('wheel',{deltaY:100,ctrlKey:true,bubbles:true,cancelable:true});element.dispatchEvent(event);return event.defaultPrevented;});assert.equal(zoom,false);
});
Then('editor scrolling preferences survive reload',async function(){
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await preferences(this.page);
  await expect(this.page.getByRole('slider',{name:'Scroll speed',exact:true})).toHaveValue('2');
  await expect(this.page.getByRole('switch',{name:'Smooth scrolling',exact:true})).toBeChecked();
});

Then('editor wheel reversals respond immediately near both document edges',async function(){
  await this.page.emulateMedia({reducedMotion:'no-preference'});
  const traces=await scroller(this.page).evaluate(async element=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const wheel=deltaY=>element.dispatchEvent(new WheelEvent('wheel',{deltaY,bubbles:true,cancelable:true}));
    const traces=[];
    for(const direction of [1,-1]){
      element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      element.scrollTop=direction===1?0:element.scrollHeight-element.clientHeight;
      await frame();await frame();
      wheel(direction*500);await frame();await frame();
      const before=element.scrollTop;
      wheel(-direction*20);
      const samples=[];for(let index=0;index<16;index++){await frame();samples.push(element.scrollTop);}
      traces.push({direction,before,samples});
    }
    return traces;
  });
  for(const {direction,before,samples} of traces){
    assert.ok(samples.some(value=>direction*(value-before)<-1),JSON.stringify(traces));
    let previous=before;
    for(const value of samples){assert.ok(direction*(value-previous)<=1,JSON.stringify(traces));previous=value;}
  }
});

Then('editor non-smoothed scrolling stays stable near document edges',async function(){
  await preferences(this.page);await this.page.getByRole('switch',{name:'Smooth scrolling',exact:true}).uncheck();await saved(this.page);
  await selectPage(this.page,'Editor');await this.page.emulateMedia({reducedMotion:'no-preference'});
  const traces=await scroller(this.page).evaluate(async element=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));const traces=[];
    for(const from of [0,40,500,element.scrollHeight-element.clientHeight-40,element.scrollHeight-element.clientHeight]){
      element.scrollTop=from;for(let i=0;i<4;i++)await frame();
      const deltaY=from>500?-10:10;
      element.dispatchEvent(new WheelEvent('wheel',{deltaY,bubbles:true,cancelable:true}));
      const first=element.scrollTop,samples=[];
      for(let i=0;i<20;i++){await frame();samples.push({top:element.scrollTop,height:element.scrollHeight});}
      traces.push({from,first,samples});
    }
    return traces;
  });
  for(const trace of traces)for(const sample of trace.samples)assert.ok(Math.abs(sample.top-trace.first)<2,JSON.stringify(traces));
  const bounds=await scroller(this.page).boundingBox();assert.ok(bounds);
  await this.page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
  for(const direction of [-1,1]){
    await scroller(this.page).evaluate((element,direction)=>element.scrollTop=direction<0?0:element.scrollHeight-element.clientHeight,direction);
    const first=await scroller(this.page).evaluate(async element=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {top:element.scrollTop,y:element.getBoundingClientRect().y};});
    for(let index=0;index<4;index++){
      await this.page.mouse.wheel(0,direction*80);
      const next=await scroller(this.page).evaluate(async element=>{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {top:element.scrollTop,y:element.getBoundingClientRect().y};});
      assert.deepEqual(next,first,'Wheel input at the boundary must not bounce the editor or its parent');
    }
  }
  await preferences(this.page);await this.page.getByRole('switch',{name:'Smooth scrolling',exact:true}).check();await saved(this.page);await selectPage(this.page,'Editor');
});

Then('editor smoothing tolerates wheel events after the frame timestamp',async function(){
  await this.page.emulateMedia({reducedMotion:'no-preference'});
  const trace=await scroller(this.page).evaluate(async element=>{
    element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));element.scrollTop=2000;
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));await frame();await frame();
    const before=element.scrollTop,original=requestAnimationFrame;
    window.requestAnimationFrame=callback=>{window.requestAnimationFrame=original;return original(time=>callback(time-50));};
    element.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));
    const samples=[];for(let index=0;index<20;index++){await frame();samples.push(element.scrollTop);}
    return{before,samples};
  });
  let previous=trace.before;
  for(const value of trace.samples){assert.ok(value>=previous,JSON.stringify(trace));previous=value;}
  assert.equal(trace.samples.at(-1),trace.before+200);
});
