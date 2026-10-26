// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';

const strips=page=>page.locator('.editor-tabs > .file-tabs');
const strip=(page,index)=>strips(page).nth(index-1);
const tab=(page,index,path)=>strip(page,index).locator(`[data-tab-path=${JSON.stringify(path)}]`);
const documents=page=>page.locator('.editor-document > .code-editor .cm-content, .editor-document > .split-editor .cm-content');
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');

When('native tab dragging is observed',async function(){
  this.tabDragCount=0;
  await this.page.evaluate(()=>{
    window.tabDragEvents=[];
    document.addEventListener('dragstart',event=>{
      const source=event.target.closest?.('[data-tab-path]');
      if(!event.isTrusted||!source)return;
      const path=source.dataset.tabPath;
      window.tabDragEvents.push({type:'dragstart',path});
      // Cross-viewport moves remove this node before native dragend bubbles.
      source.addEventListener('dragend',end=>{
        if(end.isTrusted)window.tabDragEvents.push({type:'dragend',path});
      },{once:true});
    },true);
  });
});

async function holdTab(world,path,source,side,targetPath,target){
  await saved(world.page);
  const from=tab(world.page,source,path),to=tab(world.page,target,targetPath);
  await expect(from).toHaveAttribute('draggable','true');
  await from.scrollIntoViewIfNeeded();await to.scrollIntoViewIfNeeded();
  const a=await from.locator('.file-tab-select').boundingBox(),b=await to.boundingBox();
  expect(a&&b).toBeTruthy();
  const x=b.x+(side==='before'?2:b.width-2),y=b.y+b.height/2;
  world.tabDropBoundary={target,targetPath,side};
  await world.page.mouse.move(a.x+a.width/2,a.y+a.height/2);
  await world.page.mouse.down();
  await world.page.mouse.move(a.x+a.width/2+8,a.y+a.height/2+8,{steps:3});
  await world.page.mouse.move(x,y,{steps:8});
  await world.page.mouse.move(x+(side==='before'?1:-1),y);
  await expect.poll(()=>world.page.evaluate(()=>window.tabDragEvents.filter(event=>event.type==='dragstart').length)).toBe(world.tabDragCount+1);
  await expect(world.page.locator('[data-tab-drop-indicator]')).toBeVisible();
  const preview=world.page.locator('[data-tab-drag-preview]');
  await expect(preview).toBeVisible();await expect(preview).toHaveCSS('opacity','0.75');
  expect(await preview.evaluate(element=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(element).backgroundColor;context.fillRect(0,0,1,1);
    return context.getImageData(0,0,1,1).data[3];
  })).toBe(255);

  const held=await preview.boundingBox();
  expect(x-held.x).toBeGreaterThanOrEqual(0);expect(x-held.x).toBeLessThanOrEqual(held.width);
  expect(y-held.y).toBeGreaterThanOrEqual(0);expect(y-held.y).toBeLessThanOrEqual(held.height);

}

When('I hold tab {string} in viewport {int} {word} tab {string} in viewport {int}',async function(path,source,side,targetPath,target){
  expect(['before','after']).toContain(side);await holdTab(this,path,source,side,targetPath,target);
});

async function completeDrag(world,cancel=false){
  if(cancel)await world.page.keyboard.press('Escape');
  await world.page.mouse.up();
  await expect.poll(()=>world.page.evaluate(()=>window.tabDragEvents.filter(event=>event.type==='dragend').length)).toBe(world.tabDragCount+1);
  world.tabDragCount++;
  await saved(world.page);
  await expect(world.page.locator('[data-tab-drop-indicator]')).toHaveCount(0);
  await expect(world.page.locator('[data-tab-drag-preview]')).toHaveCount(0);
}
When('the held tab drag survives a window blur',async function(){
  await this.page.evaluate(()=>window.dispatchEvent(new FocusEvent('blur')));
  await expect(this.page.locator('[data-tab-drop-indicator]')).toHaveCount(0);
  const {target,targetPath,side}=this.tabDropBoundary;
  const box=await tab(this.page,target,targetPath).boundingBox();
  const x=box.x+(side==='before'?2:box.width-2),y=box.y+box.height/2;
  await this.page.mouse.move(x,y);await this.page.mouse.move(x+(side==='before'?1:-1),y);
  await expect(this.page.locator('[data-tab-drop-indicator]')).toBeVisible();
});
When('I release the dragged tab',async function(){await completeDrag(this);});
When('I cancel the held tab drag',async function(){await completeDrag(this,true);});
When('I drag tab {string} in viewport {int} {word} tab {string} in viewport {int}',async function(path,source,side,targetPath,target){
  await holdTab(this,path,source,side,targetPath,target);await completeDrag(this);
});

Then('the tab insertion line marks that boundary in the link hover color',async function(){
  const {target,targetPath,side}=this.tabDropBoundary;
  const indicator=this.page.locator('[data-tab-drop-indicator]');
  const line=await indicator.boundingBox(),destination=await tab(this.page,target,targetPath).boundingBox();
  expect(line.width).toBeGreaterThan(0);expect(line.width).toBeLessThanOrEqual(3);expect(line.height).toBeGreaterThan(20);
  expect(Math.abs(line.x+line.width/2-(side==='before'?destination.x:destination.x+destination.width))).toBeLessThan(3);
  expect(await indicator.evaluate(element=>{
    const probe=document.createElement('span');probe.style.color='var(--color-accent)';element.append(probe);
    const actual=getComputedStyle(element),expected=getComputedStyle(probe).color;probe.remove();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
    const color=value=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].join(',');};
    return [actual.backgroundColor,actual.borderLeftColor,actual.borderRightColor].some(value=>color(value)===color(expected));
  })).toBe(true);
  expect(await tab(this.page,target,targetPath).evaluate(element=>{
    const style=getComputedStyle(element);return [style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth];
  })).toEqual(['0px','0px','0px','0px']);
});
Then('no tab insertion line remains',async function(){await expect(this.page.locator('[data-tab-drop-indicator]')).toHaveCount(0);});
Then('viewport {int} has tabs {string} with {string} selected',async function(index,files,active){
  await saved(this.page);
  const list=strip(this.page,index);
  await expect.poll(()=>list.locator('.file-tab').evaluateAll(elements=>elements.map(element=>element.dataset.tabPath))).toEqual(files.split(','));
  await expect(list.locator('.file-tab.active')).toHaveAttribute('data-tab-path',active);
});
Then('there are {int} tab-drag viewports',async function(count){
  await expect(strips(this.page)).toHaveCount(count);await expect(documents(this.page)).toHaveCount(count);
});
When('I select viewport {int} tab {string}',async function(index,path){
  await tab(this.page,index,path).locator('.file-tab-select').click();await saved(this.page);
  await expect(tab(this.page,index,path)).toHaveClass(/\bactive\b/);
});
When('I close viewport {int} tab {string}',async function(index,path){
  await tab(this.page,index,path).locator('.file-tab-close').click();await saved(this.page);
});
Then('viewport {int} contains {string}',async function(index,text){await expect(documents(this.page).nth(index-1)).toHaveText(text);});
When('I place viewport {int} cursor at the {word}',async function(index,where){
  expect(['beginning','end']).toContain(where);
  await documents(this.page).nth(index-1).click();await this.page.keyboard.press(where==='end'?'Control+End':'Control+Home');
});
Then('viewport {int} cursor is at the {word}',async function(index,where){
  const document=documents(this.page).nth(index-1);await expect(document).toBeFocused();
  const position=await document.evaluate(element=>{
    const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(element);range.setEnd(selection.anchorNode,selection.anchorOffset);
    return {offset:range.toString().length,length:element.textContent.length};
  });
  expect(position.offset).toBe(where==='end'?position.length:0);
});
When('I watch tab-drag viewport {int}',async function(index){
  this.tabDragWatchIndex=index;
  await documents(this.page).nth(index-1).evaluate(element=>{
    const editor=element.closest('.cm-editor');
    const watched=window.tabDragWatched={editor,content:element,minimap:editor.querySelector('.cm-minimap-gutter'),html:element.innerHTML,text:element.textContent,opening:false};
    watched.observer=new MutationObserver(records=>{
      if(records.some(record=>[...record.addedNodes].some(node=>node.textContent?.includes('Opening split editor'))))watched.opening=true;
    });
    watched.observer.observe(element.closest('.split-editor, .code-editor'),{childList:true,subtree:true});
  });
});
Then('the watched tab-drag viewport keeps its editor and minimap',async function(){
  expect(await documents(this.page).nth(this.tabDragWatchIndex-1).evaluate(element=>{
    const previous=window.tabDragWatched,editor=element.closest('.cm-editor');previous.observer.disconnect();
    return {editor:editor===previous.editor,content:element===previous.content,minimap:editor.querySelector('.cm-minimap-gutter')===previous.minimap,
      html:element.innerHTML===previous.html,opening:previous.opening};
  })).toEqual({editor:true,content:true,minimap:true,html:true,opening:false});
});
Then('the watched tab-drag viewport keeps its editor while changing files',async function(){
  await this.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(await documents(this.page).nth(this.tabDragWatchIndex-1).evaluate(element=>{
    const previous=window.tabDragWatched,editor=element.closest('.cm-editor');previous.observer.disconnect();
    const map=editor.querySelector('.cm-minimap-gutter'),canvas=map?.querySelector('canvas');
    const box=editor.getBoundingClientRect(),bounds=map?.getBoundingClientRect();
    const painted=canvas&&canvas.width>0&&canvas.height>0&&canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((value,index)=>index%4===3&&value>0);
    const scroll=editor.querySelector('.cm-scroller'),overflow=scroll.scrollHeight>scroll.clientHeight+1;
    return {editor:editor===previous.editor,content:element===previous.content,text:element.textContent===previous.text,opening:previous.opening,
      minimapVisible:overflow===(!!bounds&&bounds.width>0&&bounds.height>0),minimapPainted:!overflow||!!painted,
      minimapBounded:!overflow||!!bounds&&bounds.left>=box.left&&bounds.right<=box.right+1};
  })).toEqual({editor:true,content:true,text:true,opening:false,minimapVisible:true,minimapPainted:true,minimapBounded:true});
});
When('I drop external text on viewport {int} tabs',async function(index){
  await strip(this.page,index).evaluate(element=>{
    const dataTransfer=new DataTransfer();dataTransfer.setData('text/plain','file2.txt');
    const box=element.getBoundingClientRect();
    for(const type of ['dragenter','dragover','drop'])element.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer,clientX:box.x+5,clientY:box.y+box.height/2}));
  });
  await saved(this.page);
});
