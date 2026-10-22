// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
When('I profile scrolling with one two and four editor panes',{timeout:120_000},async function(){
  await this.context.tracing.stop();await this.context.tracing.start({screenshots:false,snapshots:false,sources:false});
  await this.page.getByLabel('Code editor document',{exact:true}).click();
  await this.page.keyboard.insertText(Array.from({length:3000},(_,i)=>`function method${i}(value) { const result = value.split(" "); return result.join(","); }`).join('\n'));
  await saved(this.page);await this.page.keyboard.press('Control+Home');
  await this.page.emulateMedia({reducedMotion:'no-preference'});
  const cdp=await this.context.newCDPSession(this.page);await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  const samples=[];
  for(const panes of [1,2,4]){
    while(await this.page.locator('.editor-document .cm-editor').count()<panes){
      await this.page.getByRole('button',{name:'Switch to main.js',exact:true}).click({button:'right'});
      await this.page.getByRole('menu',{name:'Tab actions for main.js',exact:true}).getByRole('menuitem',{name:'Open in split view',exact:true}).click();await saved(this.page);
    }
    for(const position of ['top','tail']){
      await this.page.evaluate(async position=>{
        const editors=[...document.querySelectorAll('.editor-document .cm-editor')],scroll=editors.at(-1).querySelector('.cm-scroller');
        scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
        scroll.scrollTop=position==='top'?0:scroll.scrollHeight-scroll.clientHeight-8000;
        await new Promise(resolve=>setTimeout(resolve,300));
      },position);
      await cdp.send('HeapProfiler.collectGarbage');
      const before=await metrics();
      const profile=await this.page.evaluate(async()=>{
        const editors=[...document.querySelectorAll('.editor-document .cm-editor')],scroll=editors.at(-1).querySelector('.cm-scroller');
        const paints=editors.map(()=>0),gitMutations=editors.map(()=>0);let readbacks=0;
        const startTop=scroll.scrollTop;
        const observers=editors.map((editor,index)=>{
          const observer=new MutationObserver(records=>{for(const record of records){
            if(record.target instanceof Element&&record.target.classList.contains('cm-line')&&((record.oldValue??'').includes('cm-git-')||record.target.className.includes('cm-git-')))gitMutations[index]++;
          }});
          observer.observe(editor,{subtree:true,attributes:true,attributeOldValue:true,attributeFilter:['class']});return observer;
        });
        const read=CanvasRenderingContext2D.prototype.getImageData;
        const clear=CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.getImageData=function(...args){if(this.canvas.closest('.cm-minimap-inner'))readbacks++;return read.apply(this,args);};
        CanvasRenderingContext2D.prototype.clearRect=function(...args){const index=editors.findIndex(editor=>editor.contains(this.canvas));if(index>=0&&this.canvas.closest('.cm-minimap-inner')&&args[0]===0&&args[1]===0)paints[index]++;return clear.apply(this,args);};
        const gaps=[];let previous=performance.now(),start=previous;
        for(let frame=0;frame<128;frame++){
          const time=await new Promise(resolve=>requestAnimationFrame(resolve));gaps.push(time-previous);previous=time;
          if(frame<120&&frame%2===0)scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:65,bubbles:true,cancelable:true}));
        }
        observers.forEach(observer=>observer.disconnect());CanvasRenderingContext2D.prototype.getImageData=read;CanvasRenderingContext2D.prototype.clearRect=clear;
        const elapsed=performance.now()-start,sorted=gaps.filter(gap=>gap>0).sort((a,b)=>a-b);
        return {wallMs:elapsed,frameP95:sorted[Math.floor(sorted.length*.95)],longFrames:gaps.filter(gap=>gap>25).length,paints,gitMutations,readbacks,scrollTop:scroll.scrollTop,scrollDistance:scroll.scrollTop-startTop};
      });
      const after=await metrics();
      samples.push({panes,position,...profile,cpuMs:(after.TaskDuration-before.TaskDuration)*1000,scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,heapMB:after.JSHeapUsedSize/1048576});
    }
  }
  await mkdir(this.artifactDirectory,{recursive:true});
  await writeFile(`${this.artifactDirectory}/scroll-profile.json`,JSON.stringify(samples,null,2));
  if(process.env.SCROLL_PROFILE_OUTPUT)await writeFile(process.env.SCROLL_PROFILE_OUTPUT,JSON.stringify(samples,null,2));
  await this.attach(JSON.stringify(samples),'application/json');console.log('Scroll profile:',JSON.stringify(samples));
  this.scrollProfile=samples;
  await cdp.detach();
});
Then('scrolling does not repaint inactive minimaps or interrupt wheel movement',function(){
  for(const sample of this.scrollProfile){
    expect(sample.readbacks,`${sample.panes} panes: no minimap pixel readbacks`).toBe(0);
    expect(sample.paints.slice(0,-1),`${sample.panes} panes: inactive minimaps`).toEqual(Array(sample.panes-1).fill(0));
    expect(sample.scrollDistance,`${sample.panes} panes: complete wheel distance`).toBeGreaterThan(3800);
    expect(sample.scrollDistance).toBeLessThanOrEqual(3900);
  }
});
Then('a reload during split scrolling preserves the current viewport',async function(){
  await saved(this.page);
  await Promise.all([
    this.page.waitForNavigation({waitUntil:'load'}),
    this.page.evaluate(()=>{
      const scroll=[...document.querySelectorAll('.editor-document .cm-scroller')].at(-1);
      scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=2500;
      // Reload before the idle workspace report; page exit must flush the view.
      requestAnimationFrame(()=>location.reload());
    })
  ]);
  await expect(this.page.locator('.editor-document .cm-editor')).toHaveCount(4);
  await expect.poll(()=>this.page.locator('.editor-document .cm-scroller').last().evaluate(scroll=>scroll.scrollTop)).toBe(2500);
});
Then('backgrounding the application saves each pane before the scroll idle timeout',async function(){
  await saved(this.page);
  const captured=await this.page.evaluate(async()=>{
    const scrollers=[...document.querySelectorAll('.editor-document .cm-scroller')];
    scrollers.forEach((scroll,index)=>{
      scroll.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));scroll.scrollTop=(index+1)*500;
    });
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const original=Object.getOwnPropertyDescriptor(document,'visibilityState');
    try{
      Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});
      document.dispatchEvent(new Event('visibilitychange'));
      const workspace=JSON.parse(localStorage.getItem('code.workspace.v1')),repo=workspace.repositories[workspace.repositoryId];
      return [repo.documents[repo.activeFile].scrollTop,...repo.splitViews.map(view=>view.session.scrollTop)];
    }finally{
      if(original)Object.defineProperty(document,'visibilityState',original);else delete document.visibilityState;
    }
  });
  expect(captured).toEqual([500,1000]);
});
When('I disable smoothing and set scroll speed to one and a half',async function(){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  const slider=this.page.getByRole('slider',{name:'Scroll speed',exact:true});
  await slider.evaluate(element=>{element.value='1.5';element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});
  await this.page.getByRole('switch',{name:'Smooth scrolling',exact:true}).uncheck();await saved(this.page);
  await selectPage(this.page,'Editor');await this.page.emulateMedia({reducedMotion:'no-preference'});
});
Then('immediate wheel scrolling stays stable in every editor pane',async function(){
  const scrolls=this.page.locator('.editor-document .cm-scroller');
  const traces=[];
  for(let pane=0;pane<await scrolls.count();pane++){
    const scroll=scrolls.nth(pane);
    for(const focused of [false,true]){
      if(focused)await scroll.locator('.cm-content').click();else await this.page.getByLabel('Code editor document',{exact:true}).focus();
      await scroll.evaluate(async element=>{element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));element.scrollTop=0;await new Promise(resolve=>setTimeout(resolve,200));window.wheelTrace=[];const watch=()=>{window.wheelTrace?.push({top:element.scrollTop,height:element.scrollHeight});if(window.wheelTrace)requestAnimationFrame(watch);};requestAnimationFrame(watch);});
      const box=await scroll.boundingBox();await this.page.mouse.move(box.x+box.width/3,box.y+box.height/2);
      for(let index=0;index<12;index++){await this.page.mouse.wheel(0,65);await this.page.waitForTimeout(index%3===2?160:20);}
      const result=await scroll.evaluate(async element=>{await new Promise(resolve=>setTimeout(resolve,200));const frames=window.wheelTrace;window.wheelTrace=null;return {top:element.scrollTop,frames};});
      traces.push({pane,focused,...result});
      expect(result.top,`pane ${pane+1}, focused ${focused}: exact 1.5× distance`).toBeCloseTo(1170,0);
      for(let index=1;index<result.frames.length;index++)expect(result.frames[index].top,`pane ${pane+1} reverses while scrolling down`).toBeGreaterThanOrEqual(result.frames[index-1].top-1);
    }
  }
  await this.attach(JSON.stringify(traces),'application/json');
});
Then('fine wheel movements accumulate at the configured scroll speed in every pane',async function(){
  const positions=await this.page.locator('.editor-document .cm-scroller').evaluateAll(async scrolls=>{
    const positions=[];
    for(const element of scrolls){
      element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));element.scrollTop=1000;
      for(let event=0;event<40;event++)element.dispatchEvent(new WheelEvent('wheel',{deltaY:.25,bubbles:true,cancelable:true}));
      const immediate=element.scrollTop;await new Promise(resolve=>setTimeout(resolve,200));positions.push({immediate,settled:element.scrollTop});
    }
    return positions;
  });
  await this.attach(JSON.stringify(positions),'application/json');
  for(const position of positions){expect(position.immediate).toBeCloseTo(1015,0);expect(position.settled).toBe(position.immediate);}
});
Then('saving a split scroll position does not restart its syntax rendering',async function(){
  const changes=await this.page.locator('.split-editor .cm-scroller').evaluateAll(async scrolls=>{
    const changes=[];
    for(const scroll of scrolls){
      scroll.scrollTop=1500;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      let records=0;const content=scroll.querySelector('.cm-content');
      const observer=new MutationObserver(mutations=>{records+=mutations.length;});
      observer.observe(content,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
      await new Promise(resolve=>setTimeout(resolve,350));observer.disconnect();changes.push(records);
    }
    return changes;
  });
  await this.attach(JSON.stringify(changes),'application/json');
  expect(changes).toEqual([0,0]);
});
