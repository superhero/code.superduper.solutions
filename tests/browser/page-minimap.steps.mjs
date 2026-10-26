// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,openNavigationMenu} from './navigation.helpers.mjs';
import assert from 'node:assert/strict';

Then('Settings fill their pane with aligned tabs and a two pixel scrollbar',async function(){
  const page=this.page;await page.setViewportSize({width:2200,height:900});await selectPage(page, 'Settings', 'Appearance');
  await page.getByRole('button',{name:'AI chat',exact:true}).click();
  await expect(page.getByRole('tablist',{name:'AI conversations',exact:true})).toBeVisible();
  const tabs=page.getByRole('navigation',{name:'Settings view',exact:true}),panel=page.locator('#panel-settings');
  await expect(tabs.getByRole('tab',{selected:true})).toContainText('Appearance');
  for(const width of [2200,1800]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>panel.evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
    await expect.poll(()=>panel.evaluate(node=>Math.abs(node.clientWidth-node.querySelector('.settings-page').getBoundingClientRect().width))).toBeLessThanOrEqual(1);
    const metrics=await panel.evaluate(node=>({bar:getComputedStyle(node,'::-webkit-scrollbar').width,height:getComputedStyle(node,'::-webkit-scrollbar').height,gutter:node.offsetWidth-node.clientWidth}));
    assert.equal(metrics.bar,'2px');assert.equal(metrics.height,'2px');assert.ok(metrics.gutter<=2,JSON.stringify(metrics));
    const [settings,explorer,ai,body]=await Promise.all([tabs.boundingBox(),page.locator('.explorer-tabs').boundingBox(),page.locator('.conversation-tabs').boundingBox(),panel.boundingBox()]);
    for(const other of [explorer,ai]){assert.ok(Math.abs(settings.y-other.y)<1);assert.ok(Math.abs(settings.height-other.height)<1);}
    assert.ok(Math.abs(settings.y+settings.height-body.y)<1);
    await panel.evaluate(node=>node.scrollTop=200);await expect.poll(()=>panel.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
    assert.ok(Math.abs((await tabs.boundingBox()).y-settings.y)<1,'Settings tabs stay above the scrolling body');
  }
});

async function exercise(page,name){
  const panel=page.locator(`#panel-${name.toLowerCase()}`),map=page.getByRole('scrollbar',{name:`${name} minimap`,exact:true});
  await expect(map).toBeVisible();
  await expect.poll(()=>panel.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  await expect.poll(()=>map.locator('canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).some((v,i)=>i%4===3&&v>0))).toBe(true);
  await panel.evaluate(e=>e.scrollTop=0);
  await expect.poll(()=>panel.evaluate(panel=>{
    const canvas=panel.parentElement.querySelector('.page-minimap canvas');
    const surface=panel.querySelector(panel.id==='panel-history'?'.history-page > section:not([hidden]) .commit-markdown pre':'.settings-card');
    if(!surface)return false;
    const probe=document.createElement('canvas'),ctx=probe.getContext('2d');
    ctx.fillStyle=getComputedStyle(surface).backgroundColor;ctx.fillRect(0,0,1,1);
    const expected=ctx.getImageData(0,0,1,1).data;
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    // Sample full cards/code blocks. Tiny metadata pills blend with their text
    // below two pixels and cannot reliably retain a pure background pixel.
    for(let i=0;i<pixels.length;i+=4) if(expected[3]>0&&[0,1,2].every(channel=>Math.abs(pixels[i+channel]-expected[channel])<=32)
      &&Math.abs(pixels[i+3]-expected[3])<=32)return true;
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
  await selectPage(this.page, 'Settings', 'Editor');
  await this.page.getByRole('switch',{name:'Settings minimap',exact:true}).click();
  await selectPage(this.page, 'Settings', 'AI');
  for(const width of [1280,390]){await this.page.setViewportSize({width,height:900});await exercise(this.page,'Settings');}
});
Then('the History minimap navigates the long commit',async function(){
  await selectPage(this.page, 'Settings', 'Editor');
  await this.page.getByRole('switch',{name:'History minimap',exact:true}).check();
  await selectPage(this.page,'History');
  await this.page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:'Committed',exact:true}).click();
  await exercise(this.page,'History');
});
Then('History minimap is independently opt-in with a native scrollbar when disabled',async function(){
  const page=this.page,panel=page.locator('#panel-history');
  const map=page.getByRole('scrollbar',{name:'History minimap',exact:true});
  const nativeScrollbar=()=>panel.evaluate(e=>getComputedStyle(e).scrollbarWidth!=='none'&&getComputedStyle(e,'::-webkit-scrollbar').display!=='none');
  const saved=()=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await selectPage(page,'History');
  await page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:'Committed',exact:true}).click();
  await expect.poll(()=>panel.evaluate(e=>e.scrollHeight>e.clientHeight)).toBe(true);
  await expect(map).toHaveCount(0);await expect.poll(nativeScrollbar).toBe(true);
  await selectPage(page, 'Settings', 'Editor');
  const history=page.getByRole('switch',{name:'History minimap',exact:true});
  const settings=page.getByRole('switch',{name:'Settings minimap',exact:true});
  const editor=page.getByRole('switch',{name:'Minimap',exact:true});
  await expect(history).not.toBeChecked();await expect(settings).not.toBeChecked();
  await expect(page.getByRole('switch',{name:'Scrollbars',exact:true})).not.toBeChecked();
  await editor.uncheck();await history.check();await saved();
  await expect(map).toBeVisible();await expect.poll(nativeScrollbar).toBe(false);
  await page.reload({waitUntil:'networkidle'});await saved();
  await expect(history).toBeChecked();await expect(settings).not.toBeChecked();await expect(editor).not.toBeChecked();
  await expect(map).toBeVisible();
  await history.uncheck();await saved();
  await expect(map).toHaveCount(0);await expect.poll(nativeScrollbar).toBe(true);
});
Then('editor and History minimaps hide when their content fits',async function(){
  const editor=this.page.getByLabel('Code editor document',{exact:true});
  const map=this.page.getByRole('group',{name:'Document minimap',exact:true});
  await expect(editor).toBeVisible();await expect(map).toBeHidden();
  await editor.fill(Array.from({length:180},(_,i)=>`Line ${i}`).join('\n'));
  await expect(map).toBeVisible();
  await expect(this.page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await editor.fill('Short document');await expect(map).toBeHidden();
  await selectPage(this.page, 'Settings', 'Editor');
  await this.page.getByRole('switch',{name:'History minimap',exact:true}).check();
  await selectPage(this.page,'History');
  await expect(this.page.getByRole('scrollbar',{name:'History minimap',exact:true})).toBeHidden();
});
Then('Settings minimap is opt-in and independent from editor minimaps and scrollbars',async function(){
  const page=this.page;
  await page.setViewportSize({width:1280,height:500});
  await page.getByLabel('Code editor document',{exact:true}).fill(Array.from({length:180},(_,i)=>`Line ${i}`).join('\n'));
  const map=page.getByRole('group',{name:'Document minimap',exact:true});
  const scroller=page.locator('.primary-pane .cm-scroller');
  await expect(map).toBeVisible();
  await expect.poll(()=>scroller.evaluate(e=>getComputedStyle(e).scrollbarWidth)).toBe('none');
  await selectPage(page, 'Settings', 'Editor');
  const minimap=page.getByRole('switch',{name:'Minimap',exact:true}),settingsMinimap=page.getByRole('switch',{name:'Settings minimap',exact:true}),scrollbars=page.getByRole('switch',{name:'Scrollbars',exact:true});
  await expect(minimap).toBeChecked();await expect(settingsMinimap).not.toBeChecked();await expect(scrollbars).not.toBeChecked();
  const panel=page.locator('#panel-settings');
  const settingsMap=page.getByRole('scrollbar',{name:'Settings minimap',exact:true});
  const nativeScrollbar=()=>panel.evaluate(e=>getComputedStyle(e).scrollbarWidth!=='none'&&getComputedStyle(e,'::-webkit-scrollbar').display!=='none');
  await expect(settingsMap).toHaveCount(0);await expect.poll(nativeScrollbar).toBe(true);
  await settingsMinimap.click();await expect(settingsMap).toBeVisible();
  await expect.poll(()=>panel.evaluate(e=>getComputedStyle(e).scrollbarWidth)).toBe('none');
  await scrollbars.click();
  await expect.poll(()=>panel.evaluate(e=>getComputedStyle(e).scrollbarWidth)).not.toBe('none');
  await selectPage(page,'Editor');await expect(map).toBeVisible();
  await expect.poll(()=>scroller.evaluate(e=>getComputedStyle(e).scrollbarWidth)).not.toBe('none');
  await selectPage(page, 'Settings', 'Editor');await minimap.click();
  await expect(settingsMap).toBeVisible();
  await expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await page.reload({waitUntil:'networkidle'});
  await expect(minimap).not.toBeChecked();await expect(settingsMinimap).toBeChecked();await expect(scrollbars).toBeChecked();
  await expect(settingsMap).toBeVisible();await expect.poll(nativeScrollbar).toBe(true);
  await settingsMinimap.click();await scrollbars.click();
  await expect(settingsMap).toHaveCount(0);await expect.poll(nativeScrollbar).toBe(true);
  await expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await selectPage(page,'History');await expect(page.getByRole('scrollbar',{name:'History minimap',exact:true})).toHaveCount(0);
  await selectPage(page,'Editor');await expect(map).toHaveCount(0);
  await expect.poll(()=>scroller.evaluate(e=>getComputedStyle(e).scrollbarWidth)).not.toBe('none');
});
