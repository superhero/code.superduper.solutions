// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {Given,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage} from './navigation.helpers.mjs';
import {installHistoryRenderingFixture} from './history-rendering.helpers.mjs';
import {repositorySnapshot} from './repository-snapshot.helpers.mjs';

Given('a long History rendering fixture with {int} mainline changes',{timeout:60_000},async function(size){
  await this.page.setViewportSize({width:1440,height:1100});
  this.longHistoryFixture=await installHistoryRenderingFixture(this.page,size);
  await this.page.emulateMedia({reducedMotion:'no-preference'});
});

Then('long branch motion reuses unchanged minimap geometry and preserves its pixels',{timeout:90_000},async function(){
  const page=this.page,data=this.longHistoryFixture;
  await selectPage(page, 'Settings', 'Editor');await page.getByRole('switch',{name:'History minimap',exact:true}).check();
  await expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await selectPage(page,'Editor');
  const before=await repositorySnapshot(page);
  const graph=page.getByRole('list',{name:'Staged changes',exact:true});
  const tag=graph.locator(`[data-branch-id="${data.junction}"]`);
  await expect(tag).toHaveText('102');
  await this.context.tracing.stop();
  try{
    await page.evaluate(async()=>{
      await document.fonts.ready;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    await graph.evaluate((list,watched)=>{
      const row=list.querySelector(`li[data-oid="${watched}"]`),reads={styles:0,rects:0,mutations:0};
      const mutation=new MutationObserver(records=>reads.mutations+=records.length);
      mutation.observe(row,{subtree:true,attributes:true,childList:true,characterData:true});
      const style=window.getComputedStyle,rects=Element.prototype.getClientRects,context=HTMLCanvasElement.prototype.getContext;
      let capturing=false;
      HTMLCanvasElement.prototype.getContext=function(...args){
        if(this.closest('.page-minimap')){capturing=true;queueMicrotask(()=>capturing=false);}
        return context.apply(this,args);
      };
      window.getComputedStyle=function(node,...args){
        if(capturing&&row.contains(node))reads.styles++;
        return style.call(this,node,...args);
      };
      Element.prototype.getClientRects=function(...args){
        if(capturing&&row.contains(this))reads.rects++;
        return rects.apply(this,args);
      };
      window.__historyGeometryReads=reads;
      window.__restoreHistoryGeometryReads=()=>{
        mutation.disconnect();
        window.getComputedStyle=style;Element.prototype.getClientRects=rects;HTMLCanvasElement.prototype.getContext=context;
      };
    },data.watched);
    for(const expanded of [true,false]){
      await tag.scrollIntoViewIfNeeded();
      await tag.focus();await tag.press('Enter');
      await expect(tag).toHaveAttribute('aria-expanded',String(expanded));
      await expect(graph).toHaveAttribute('data-branch-motion','idle');
      await expect(graph.locator('li[data-oid]')).toHaveCount(data.mainline+(expanded?102:0));
    }
    const reads=await page.evaluate(()=>{window.__restoreHistoryGeometryReads();return window.__historyGeometryReads;});
    await this.attach(JSON.stringify(reads),'application/json');
    assert.equal(reads.mutations,0,'A branch toggle leaves unrelated checkpoint markup untouched');
    // Allow one initial paint, but unrelated rows must retain their rail sizes
    // and must not receive animation-distance updates or repeated captures.
    assert.ok(reads.styles<=20&&reads.rects<=16,
      `Unchanged offscreen messages reuse detailed paint geometry: ${JSON.stringify(reads)}`);
    // A forced full recapture is the pixel oracle for cached row translations.
    for(const expanded of [true,false]){
      await tag.scrollIntoViewIfNeeded();await tag.focus();await tag.press('Enter');
      await expect(tag).toHaveAttribute('aria-expanded',String(expanded));
      await expect(graph).toHaveAttribute('data-branch-motion','idle');
      await page.mouse.move(2,2);await page.waitForTimeout(180);
      const result=await page.getByRole('scrollbar',{name:'History minimap',exact:true}).evaluate(async minimap=>{
        const canvas=minimap.querySelector('canvas'),context=canvas.getContext('2d');
        const initial=context.getImageData(0,0,canvas.width,canvas.height).data;
        document.documentElement.style.setProperty('--minimap-test-refresh','1');
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const refreshed=context.getImageData(0,0,canvas.width,canvas.height).data;
        let different=0,largest=0;
        for(let index=0;index<initial.length;index++){
          const delta=Math.abs(initial[index]-refreshed[index]);if(delta>2)different++;largest=Math.max(largest,delta);
        }
        document.documentElement.style.removeProperty('--minimap-test-refresh');
        return {different,largest,channels:initial.length};
      });
      assert.ok(result.different/result.channels<.001,
        `Cached overview agrees with a fresh capture after ${expanded?'opening':'closing'}: ${JSON.stringify(result)}`);
    }
    assert.deepEqual(await repositorySnapshot(page),before);
  }finally{
    await page.evaluate(()=>window.__restoreHistoryGeometryReads?.());
    await this.context.tracing.start({screenshots:true,snapshots:true,sources:true});
  }
});
