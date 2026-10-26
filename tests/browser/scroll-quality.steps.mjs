// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
async function configure(page,speed,smooth){
  await selectPage(page, 'Settings', 'Editor');await selectDropdown(page,'Settings scope','global');
  await page.getByRole('slider',{name:'Scroll speed',exact:true}).evaluate((element,speed)=>{
    element.value=String(speed);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
  },speed);
  await page.getByRole('switch',{name:'Smooth scrolling',exact:true}).setChecked(smooth);
  await saved(page);await selectPage(page,'Editor');
}
When('I prepare a wide document for the scroll settings review',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();
  await this.page.keyboard.insertText(Array.from({length:300},(_,index)=>`const row${index} = "${'0123456789'.repeat(100)}";`).join('\n'));
  await saved(this.page);await this.page.keyboard.press('Control+Home');
});
Then('I review every scroll speed with smoothing {string} and motion {string}',{timeout:240_000},async function(smoothing,motion){
  this.scrollReview={smooth:smoothing==='enabled',motion};
  await this.page.emulateMedia({reducedMotion:motion});
  // Shift+wheel zooms by default. Release those configurable shortcuts for this scrolling review.
  await selectPage(this.page,'Settings','Controls');await selectDropdown(this.page,'Settings scope','global');
  for(const action of ['Zoom in','Zoom out']){
    await this.page.getByRole('region',{name:'Keybindings',exact:true}).getByLabel('Filter keybindings').fill(action);
    await this.page.getByRole('button',{name:`Remove ${action} shortcut 1`,exact:true}).click();await saved(this.page);
  }
  await selectPage(this.page,'Editor');
  const reports=[];
  for(let step=1;step<=20;step++){
    const speed=step/4;await configure(this.page,speed,this.scrollReview.smooth);
    const results=await this.page.locator('.editor-document .cm-scroller').evaluateAll(async(scrolls,{speed,smooth,motion})=>{
      const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
      const reset=async(element,top=500,left=0)=>{
        element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));element.scrollTop=top;element.scrollLeft=left;await frame();await frame();
      };
      const results=[];
      for(let pane=0;pane<scrolls.length;pane++){
        const element=scrolls[pane];
        const cases=[{name:'pixels',deltaY:32},{name:'horizontal page',deltaX:1,deltaMode:2}];
        if([.25,1.5,5].includes(speed))cases.push({name:'line units',deltaY:1,deltaMode:1},{name:'vertical page',deltaY:1,deltaMode:2},{name:'shift page',deltaY:1,deltaMode:2,shiftKey:true});
        for(const input of cases){
          await reset(element);
          const before=scrolls.map(scroll=>({top:scroll.scrollTop,left:scroll.scrollLeft}));
          const horizontal=Boolean(input.deltaX||input.shiftKey),axis=horizontal?'scrollLeft':'scrollTop';
          const extent=horizontal?element.clientWidth:element.clientHeight;
          const unit=input.deltaMode===2?extent:input.deltaMode===1?parseFloat(getComputedStyle(element.querySelector('.cm-content')).lineHeight):1;
          const delta=(input.deltaX??input.deltaY)*unit*speed;
          const start=element[axis],max=horizontal?element.scrollWidth-element.clientWidth:element.scrollHeight-element.clientHeight;
          const expected=Math.min(max,start+delta);
          const wheel=new WheelEvent('wheel',{...input,bubbles:true,cancelable:true});element.dispatchEvent(wheel);
          const immediate=element[axis],positions=[start,immediate];
          for(let sample=0;sample<35;sample++){await frame();positions.push(element[axis]);if(Math.abs(element[axis]-expected)<=1&&sample>=2)break;}
          await frame();await frame();positions.push(element[axis]);
          results.push({pane,case:input.name,start,extent,unit,delta,max,expected,immediate,actual:element[axis],event:{dx:wheel.deltaX,dy:wheel.deltaY,mode:wheel.deltaMode,shift:wheel.shiftKey},prevented:wheel.defaultPrevented,
            backwards:positions.some((position,index)=>index&&position<positions[index-1]-1),
            otherMoved:scrolls.some((scroll,index)=>index!==pane&&(scroll.scrollTop!==before[index].top||scroll.scrollLeft!==before[index].left)),
            eased:smooth&&motion==='no-preference'});
        }
      }
      return results;
    },{speed,smooth:this.scrollReview.smooth,motion});
    await mkdir(this.artifactDirectory,{recursive:true});
    await writeFile(`${this.artifactDirectory}/scroll-speed-${speed}.json`,JSON.stringify(results,null,2));
    for(const result of results){
      const label=`${speed}× pane ${result.pane+1} ${result.case}`;
      expect(Math.abs(result.actual-result.expected),label).toBeLessThanOrEqual(.51);expect(result.backwards,label).toBe(false);
      expect(result.prevented,label).toBe(true);expect(result.otherMoved,label).toBe(false);
      expect(Math.abs(result.immediate-(result.eased?result.start:result.expected)),label).toBeLessThanOrEqual(.51);
    }
    reports.push({speed,cases:results.length});
  }
  await this.attach(JSON.stringify({settings:this.scrollReview,speeds:reports}),'application/json');
});
Then('fine smooth and immediate wheel gestures preserve distance in every pane',async function(){
  const results=await this.page.locator('.editor-document .cm-scroller').evaluateAll(async scrolls=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),results=[];
    for(const scroll of scrolls){
      scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=1000;await frame();await frame();
      for(let pulse=0;pulse<40;pulse++){
        scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:.05,bubbles:true,cancelable:true}));await frame();await frame();
      }
      for(let sample=0;sample<20;sample++)await frame();results.push(scroll.scrollTop);
    }
    return results;
  });
  // The matrix finishes at5×:40×0.05×5 must move10px, including tiny spaced events.
  expect(results).toEqual([1010,1010,1010]);
});
Then('fractional wheel gestures do not leak across scroll interruptions',async function(){
  const results=await this.page.locator('.editor-document .cm-scroller').evaluateAll(async scrolls=>{
    const results=[];
    for(const scroll of scrolls){
      scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=1000;
      const wheel=deltaY=>scroll.dispatchEvent(new WheelEvent('wheel',{deltaY,bubbles:true,cancelable:true}));
      wheel(.25);scroll.scrollTop=2000;wheel(.25);const external=scroll.scrollTop;
      scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=1000;wheel(.25);wheel(-.25);const reverse=scroll.scrollTop;
      wheel(.25);scroll.querySelector('.cm-content').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));wheel(.25);const keyboard=scroll.scrollTop;
      results.push({external,reverse,keyboard});
    }
    return results;
  });
  expect(results).toEqual(Array(3).fill({external:2000,reverse:1000,keyboard:1000}));
});
Then('minimap keys start from an externally restored viewport',async function(){
  const results=await this.page.locator('.editor-document .cm-scroller').evaluateAll(async scrolls=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),results=[];
    for(const scroll of scrolls){
      scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=1000;await frame();await frame();
      scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));
      scroll.scrollTop=3000;scroll.querySelector('.cm-minimap-gutter').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
      const expected=3000+parseFloat(getComputedStyle(scroll.querySelector('.cm-content')).lineHeight)*5;
      for(let sample=0;sample<35;sample++)await frame();results.push({actual:scroll.scrollTop,expected});
    }
    return results;
  });
  for(const result of results)expect(Math.abs(result.actual-result.expected)).toBeLessThanOrEqual(1);
});
Then('the newest wheel gesture controls both diff viewports',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});
  await expect(region.getByLabel('Current file',{exact:true})).toBeVisible();
  const result=await region.locator('.cm-merge-a .cm-scroller, .cm-merge-b .cm-scroller').evaluateAll(async scrolls=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    scrolls.forEach(scroll=>{scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=2000;});
    await frame();await frame();
    scrolls[0].dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true,cancelable:true}));
    scrolls[1].dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));
    for(let sample=0;sample<35;sample++)await frame();return scrolls.map(scroll=>scroll.scrollTop);
  });
  expect(result).toEqual([1500,1500]);
  const boundary=await region.locator('.cm-merge-a .cm-scroller, .cm-merge-b .cm-scroller').evaluateAll(async scrolls=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    scrolls.forEach(scroll=>{scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=0;});await frame();await frame();
    // The old pane's scroll event is still queued when the new input reaches
    // a saturated boundary and therefore produces no scroll event of its own.
    scrolls[0].scrollTop=300;scrolls[1].dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));
    for(let sample=0;sample<10;sample++)await frame();return scrolls.map(scroll=>scroll.scrollTop);
  });
  expect(boundary).toEqual([0,0]);
});
Then('all three panes clamp wheel boundaries and reverse without moving their neighbours',async function(){
  const samples=await this.page.locator('.editor-document .cm-scroller').evaluateAll(async scrolls=>{
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve)),results=[];
    const initialPage=window.scrollY;
    for(let pane=0;pane<scrolls.length;pane++)for(const edge of ['top','bottom']){
      const scroll=scrolls[pane],max=scroll.scrollHeight-scroll.clientHeight;
      scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=edge==='top'?0:max;await frame();await frame();
      const before=scrolls.map(scroll=>scroll.scrollTop),sign=edge==='top'?-1:1;
      const wheel=deltaY=>scroll.dispatchEvent(new WheelEvent('wheel',{deltaY,bubbles:true,cancelable:true}));
      wheel(sign*1000);await frame();await frame();const clamped=scroll.scrollTop;
      wheel(-sign*400);await frame();await frame();const turning=scroll.scrollTop;
      wheel(sign*400);const positions=[turning];for(let sample=0;sample<30;sample++){await frame();positions.push(scroll.scrollTop);}
      results.push({pane,edge,max,clamped,turning,final:scroll.scrollTop,
        reversed:positions.every((value,index)=>!index||sign*(value-positions[index-1])>=-1),
        others:scrolls.every((scroll,index)=>index===pane||scroll.scrollTop===before[index]),page:window.scrollY===initialPage});
    }
    return results;
  });
  for(const sample of samples){
    const label=`pane ${sample.pane+1}, ${sample.edge}`,expected=sample.edge==='top'?0:sample.max;
    expect(sample.clamped,label).toBe(expected);expect(sample.turning,label).not.toBe(expected);
    expect(Math.abs(sample.final-expected),label).toBeLessThanOrEqual(1);
    expect(sample.reversed,label).toBe(true);expect(sample.others,label).toBe(true);expect(sample.page,label).toBe(true);
  }
});
