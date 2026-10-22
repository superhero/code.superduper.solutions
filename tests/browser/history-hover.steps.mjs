// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';

Then('history hover reports rendering costs for short and long lists',{timeout:180_000},async function(){
  const page=this.page;
  await page.setViewportSize({width:1280,height:900});
  await page.emulateMedia({reducedMotion:'no-preference'});
  const graph=page.getByRole('list',{name:'Staged changes',exact:true});
  await expect(graph).toBeVisible();
  await expect(graph.locator('svg path')).not.toHaveCount(0);
  // Playwright DOM snapshots themselves traverse every row on pointer actions.
  // Pause that recorder while measuring the application's own rendering work.
  await this.context.tracing.stop();
  const cdp=await this.context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(item=>[item.name,item.value]));
  const samples=[];
  try{
    for(const size of [30,1500]){
      // Expand real rendered rows solely for DOM/render profiling. No synthetic
      // revisions are written to either Git store or the application's state.
      await graph.evaluate((list,size)=>{
        for(const row of list.querySelectorAll('[data-hover-fixture]'))row.remove();
        const originals=list.querySelectorAll('li[data-oid]');
        const template=list.querySelector('li[data-oid]:not([aria-current])').cloneNode(true);
        template.removeAttribute('aria-current');
        const fragment=document.createDocumentFragment();
        for(let index=originals.length;index<size;index++){
          const row=template.cloneNode(true);row.dataset.oid=`hover-fixture-${index}`;
          fragment.append(row);
        }
        for(const row of fragment.children)row.dataset.hoverFixture='true';
        list.append(fragment);
      },size);
      await page.locator('#panel-history').evaluate(panel=>panel.scrollTop=0);
      await expect(page.getByRole('scrollbar',{name:'History minimap',exact:true})).toBeVisible();
      await page.mouse.move(2,2);
      await page.waitForTimeout(250);
      const points=await graph.evaluate(list=>Array.from(list.querySelectorAll('li[data-oid]')).slice(1,21).map(row=>{
        const bounds=row.getBoundingClientRect();return {x:bounds.right-20,y:bounds.top+bounds.height/2};
      }));
      const capture=process.env.PROFILE_HISTORY_HOVER==='true';
      if(capture){
        await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});await cdp.send('Profiler.start');
      }
      await page.evaluate(()=>{
        window.__hoverFrames=[];window.__hoverSampling=true;
        const sample=time=>{if(window.__hoverSampling){window.__hoverFrames.push(time);requestAnimationFrame(sample);}};
        requestAnimationFrame(sample);
      });
      const before=await metrics();
      for(let pass=0;pass<2;pass++)for(const point of pass?[...points].reverse():points){
        await page.mouse.move(point.x,point.y);
      }
      const after=await metrics();
      const frames=await page.evaluate(()=>{window.__hoverSampling=false;return window.__hoverFrames;});
      if(capture){
        const {profile}=await cdp.send('Profiler.stop');
        await mkdir(this.artifactDirectory,{recursive:true});
        await writeFile(join(this.artifactDirectory,`history-hover-${size}.cpuprofile`),JSON.stringify(profile));
      }
      // Count actual browser reads separately, so instrumentation does not skew
      // the uninstrumented DevTools timing sample above.
      await page.waitForTimeout(180);
      await page.evaluate(()=>{
        const reads={styles:0,geometry:0,canvas:0};window.__hoverReads=reads;
        const style=window.getComputedStyle,rects=Element.prototype.getClientRects,range=Range.prototype.getClientRects;
        const fill=CanvasRenderingContext2D.prototype.fill;
        window.getComputedStyle=function(...args){reads.styles++;return style.apply(this,args);};
        Element.prototype.getClientRects=function(...args){reads.geometry++;return rects.apply(this,args);};
        Range.prototype.getClientRects=function(...args){reads.geometry++;return range.apply(this,args);};
        CanvasRenderingContext2D.prototype.fill=function(...args){reads.canvas++;return fill.apply(this,args);};
        window.__restoreHoverReads=()=>{window.getComputedStyle=style;Element.prototype.getClientRects=rects;
          Range.prototype.getClientRects=range;CanvasRenderingContext2D.prototype.fill=fill;};
      });
      for(const point of points.slice(0,6))await page.mouse.move(point.x,point.y);
      await page.waitForTimeout(180);
      const reads=await page.evaluate(()=>{window.__restoreHoverReads();return window.__hoverReads;});
      const intervals=frames.slice(1).map((time,index)=>time-frames[index]).sort((a,b)=>a-b);
      samples.push({rows:size,taskMs:(after.TaskDuration-before.TaskDuration)*1000,
        scriptMs:(after.ScriptDuration-before.ScriptDuration)*1000,
        styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000,
        layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,
        frames:intervals.length,p95FrameMs:intervals[Math.floor(intervals.length*.95)]??0,reads});
    }
  }finally{
    await cdp.detach();
    await this.context.tracing.start({screenshots:true,snapshots:true,sources:true});
  }
  await this.attach(JSON.stringify(samples,null,2),'application/vnd.code.history-hover+json');
  if(process.env.HISTORY_HOVER_OUTPUT){
    await mkdir(dirname(process.env.HISTORY_HOVER_OUTPUT),{recursive:true});
    await writeFile(process.env.HISTORY_HOVER_OUTPUT,JSON.stringify(samples,null,2)+'\n');
  }
  this.historyHoverSamples=samples;
});

Then('hover work stays bounded as history grows',function(){
  for (const sample of this.historyHoverSamples) {
    assert.ok(sample.reads.styles < 1000 && sample.reads.geometry < 1000,
      `Hover should refresh the affected rows, not traverse ${sample.rows} rows: ${JSON.stringify(sample.reads)}`);
  }
});

Then('history feedback fades smoothly and keeps the minimap colors current',async function(){
  const page=this.page,graph=page.getByRole('list',{name:'Staged changes',exact:true});
  const row=graph.locator('li[data-oid]').nth(4);
  // Snapshotting 1,500 rows on a pointer action can consume the whole 120ms
  // transition. Sample its native interpolation without that recorder cost.
  await this.context.tracing.stop();
  try{
  const color=()=>row.evaluate(node=>getComputedStyle(node,'::before').backgroundColor);
  const expected=await page.evaluate(()=>{
    const probe=document.createElement('span');
    probe.style.backgroundColor='color-mix(in srgb, var(--color-surface) 50%, transparent)';
    document.body.append(probe);const result=getComputedStyle(probe).backgroundColor;probe.remove();return result;
  });
  await page.mouse.move(2,2);await page.waitForTimeout(180);
  await row.evaluate(node=>{
    const hold=event=>{
      if(event.target!==node||event.propertyName!=='background-color')return;
      const animations=node.getAnimations({subtree:true}).filter(animation=>animation.transitionProperty==='background-color');
      if(animations.length){
        for(const animation of animations)animation.pause();
        window.__historyHoverTransitions=animations;
        node.removeEventListener('transitionrun',hold);
      }
    };
    node.addEventListener('transitionrun',hold);
  });
  const bounds=await row.boundingBox();
  await page.mouse.move(bounds.x+bounds.width-20,bounds.y+bounds.height/2);
  await expect.poll(()=>page.evaluate(()=>!!window.__historyHoverTransitions)).toBe(true);
  const colors=await row.evaluate(async node=>{
    const animations=window.__historyHoverTransitions,colors=[];
    for(const progress of [.25,.5,.75]){
      for(const animation of animations)animation.currentTime=Number(animation.effect.getTiming().duration)*progress;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      colors.push(getComputedStyle(node,'::before').backgroundColor);
    }
    for(const animation of animations)animation.play();return colors;
  });
  await expect.poll(color).toBe(expected);
  assert.ok(new Set(colors).size>2,`Hover should have visible intermediate frames: ${JSON.stringify(colors)}`);
  const minimapAlpha=()=>row.evaluate(node=>{
    const panel=document.getElementById('panel-history'),canvas=panel.parentElement.querySelector('.page-minimap canvas');
    const bounds=node.getBoundingClientRect(),viewport=panel.getBoundingClientRect();
    const y=Math.floor((bounds.top-viewport.top+panel.scrollTop+bounds.height/2)/8*devicePixelRatio);
    const x=Math.floor((bounds.right-viewport.left+panel.scrollLeft-32)/panel.clientWidth*canvas.width);
    return canvas.getContext('2d').getImageData(x,y,1,1).data[3];
  });
  await expect.poll(minimapAlpha).toBeGreaterThanOrEqual(120);
  await page.mouse.move(2,2);
  await expect.poll(minimapAlpha).toBe(0);
  const current=graph.locator('li[aria-current="true"]');
  await current.locator('.change-load').focus();
  await expect(current.locator('.change-load')).toBeFocused();
  await expect.poll(()=>current.evaluate(node=>{
    const probe=document.createElement('span');probe.style.backgroundColor='var(--color-surface)';
    document.body.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();
    return getComputedStyle(node,'::before').backgroundColor===expected;
  })).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.mouse.move(bounds.x+bounds.width-20,bounds.y+bounds.height/2);
  assert.equal(await color(),expected);
  assert.equal(await row.evaluate(node=>node.getAnimations().length),0);
  await expect.poll(minimapAlpha).toBeGreaterThanOrEqual(120);
  await page.mouse.move(2,2);
  await expect.poll(minimapAlpha).toBe(0);
  }finally{await this.context.tracing.start({screenshots:true,snapshots:true,sources:true});}
});
