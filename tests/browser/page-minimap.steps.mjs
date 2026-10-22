// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,openNavigationMenu} from './navigation.helpers.mjs';

async function exercise(page,name){
  const panel=page.locator(`#panel-${name.toLowerCase()}`),map=page.getByRole('scrollbar',{name:`${name} minimap`,exact:true});
  await expect(map).toBeVisible();
  await expect.poll(()=>panel.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  await expect.poll(()=>map.locator('canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).some((v,i)=>i%4===3&&v>0))).toBe(true);
  await panel.evaluate(e=>e.scrollTop=0);
  await expect.poll(()=>panel.evaluate(panel=>{
    const canvas=panel.parentElement.querySelector('.page-minimap canvas');
    const surface=panel.querySelector(panel.id==='panel-history'?'section:not([hidden]) .commit-time':'.settings-card');
    if(!surface)return false;
    const probe=document.createElement('canvas'),ctx=probe.getContext('2d');
    ctx.fillStyle=getComputedStyle(surface).backgroundColor;ctx.fillRect(0,0,1,1);
    const expected=ctx.getImageData(0,0,1,1).data;
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    // A 12px metadata pill is only 1.5px tall at the overview's 1/8 scale.
    // Require its color while allowing antialiasing to reduce edge opacity.
    for(let i=0;i<pixels.length;i+=4) if(expected[3]>0&&[0,1,2].every(channel=>Math.abs(pixels[i+channel]-expected[channel])<=32)
      &&(panel.id==='panel-history'?pixels[i+3]>=64:Math.abs(pixels[i+3]-expected[3])<=32))return true;
    return false;
  })).toBe(true);
  const bounds=await map.boundingBox();
  await expect.poll(async()=>map.locator('.viewport').evaluate(e=>e.getBoundingClientRect().height/e.parentElement.getBoundingClientRect().height)).toBeCloseTo(1/8,2);
  await map.click({position:{x:bounds.width/2,y:bounds.height*.7}});
  await expect.poll(()=>panel.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await map.focus();await page.keyboard.press('Home');
  await expect.poll(()=>panel.evaluate(e=>e.scrollTop)).toBe(0);
  await map.press('PageDown');await expect.poll(()=>panel.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await map.press('Home');
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+2);await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height*.8,{steps:5});await page.mouse.up();
  await expect.poll(()=>panel.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await map.press('End');
  await expect.poll(()=>panel.evaluate(e=>Math.abs(e.scrollTop-(e.scrollHeight-e.clientHeight)))).toBeLessThan(2);
  const p=await panel.boundingBox();expect(p.x+p.width).toBeLessThanOrEqual(bounds.x+1);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
}
Then('the Settings minimap navigates the page at wide and narrow widths',async function(){
  await selectPage(this.page,'Settings');
  for(const width of [1280,390]){await this.page.setViewportSize({width,height:900});await exercise(this.page,'Settings');}
});
Then('the History minimap navigates the long commit',async function(){
  await selectPage(this.page,'History');
  await this.page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:'Commit history',exact:true}).click();
  await exercise(this.page,'History');
});
Then('editor and History minimaps hide when their content fits',async function(){
  const editor=this.page.getByLabel('Code editor document',{exact:true});
  const map=this.page.getByRole('group',{name:'Document minimap',exact:true});
  await expect(editor).toBeVisible();await expect(map).toBeHidden();
  await editor.fill(Array.from({length:180},(_,i)=>`Line ${i}`).join('\n'));
  await expect(map).toBeVisible();
  await expect(this.page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await editor.fill('Short document');await expect(map).toBeHidden();
  await selectPage(this.page,'History');
  await expect(this.page.getByRole('scrollbar',{name:'History minimap',exact:true})).toBeHidden();
});
Then('minimaps default on and scrollbars can be enabled independently',async function(){
  const page=this.page;
  await page.getByLabel('Code editor document',{exact:true}).fill(Array.from({length:180},(_,i)=>`Line ${i}`).join('\n'));
  const map=page.getByRole('group',{name:'Document minimap',exact:true});
  const scroller=page.locator('.primary-pane .cm-scroller');
  await expect(map).toBeVisible();
  await expect.poll(()=>scroller.evaluate(e=>getComputedStyle(e).scrollbarWidth)).toBe('none');
  await selectPage(page,'Settings');
  const minimap=page.getByRole('switch',{name:'Minimap',exact:true}),scrollbars=page.getByRole('switch',{name:'Scrollbars',exact:true});
  await expect(minimap).toBeChecked();await expect(scrollbars).not.toBeChecked();
  const panel=page.locator('#panel-settings');
  await expect.poll(()=>panel.evaluate(e=>getComputedStyle(e).scrollbarWidth)).toBe('none');
  await scrollbars.click();
  await expect.poll(()=>panel.evaluate(e=>getComputedStyle(e).scrollbarWidth)).not.toBe('none');
  await selectPage(page,'Editor');await expect(map).toBeVisible();
  await expect.poll(()=>scroller.evaluate(e=>getComputedStyle(e).scrollbarWidth)).not.toBe('none');
  await selectPage(page,'Settings');await scrollbars.click();await minimap.click();
  await expect(page.getByRole('scrollbar',{name:'Settings minimap',exact:true})).toHaveCount(0);
  await expect.poll(()=>panel.evaluate(e=>getComputedStyle(e).scrollbarWidth)).not.toBe('none');
  await expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await page.reload({waitUntil:'networkidle'});
  await expect(minimap).not.toBeChecked();await expect(scrollbars).not.toBeChecked();
  await selectPage(page,'History');await expect(page.getByRole('scrollbar',{name:'History minimap',exact:true})).toHaveCount(0);
  await selectPage(page,'Editor');await expect(map).toHaveCount(0);
  await expect.poll(()=>scroller.evaluate(e=>getComputedStyle(e).scrollbarWidth)).not.toBe('none');
});
