// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
When('I open tab {string} in split view',async function(file){
  await this.page.getByRole('button',{name:`Switch to ${file}`,exact:true}).click({button:'right'});
  const menu=this.page.getByRole('menu',{name:`Tab actions for ${file}`,exact:true});
  await expect(menu.getByRole('menuitem',{name:'Change name',exact:true})).toHaveCount(0);
  await expect(menu.getByRole('menuitem',{name:'Delete file',exact:true})).toHaveCount(0);
  await menu.getByRole('menuitem',{name:'Open in split view',exact:true}).click();
  await expect(this.page.getByLabel('Split editor document',{exact:true}).first()).toBeVisible();await saved(this.page);
});
Then('the split shows {string} beside {string}',async function(right,left){
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toHaveText(left.trim());
  await expect(this.page.getByLabel('Split editor document',{exact:true})).toHaveText(right.trim());
  const first=await this.page.getByLabel('Code editor document',{exact:true}).boundingBox();
  const second=await this.page.getByLabel('Split editor document',{exact:true}).boundingBox();
  expect(second.x).toBeGreaterThan(first.x+first.width-1);
});
When('I replace the split document with {string}',async function(value){
  this.beforeSplitEdit=(await repositoryHistories(this.page)).edits.length;
  const editor=this.page.getByLabel('Split editor document',{exact:true});await editor.click();
  await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(value);await saved(this.page);
});
Then('a split edit adds exactly one change revision',async function(){
  await expect.poll(async()=>(await repositoryHistories(this.page)).edits.length).toBe(this.beforeSplitEdit+1);
});
When('I insert a declaration into the primary split document',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();await this.page.keyboard.press('Control+End');
  await this.page.keyboard.insertText('\nconst extra = true;');await saved(this.page);
});
When('I close the split using tab {string}',async function(file){
  await this.page.getByRole('button',{name:`Switch to ${file}`,exact:true}).click({button:'right'});
  await this.page.getByRole('menu',{name:`Tab actions for ${file}`,exact:true}).getByRole('menuitem',{name:'Close split view',exact:true}).click();
  await saved(this.page);
});
Then('only the primary editor remains',async function(){
  await expect(this.page.getByLabel('Split editor document',{exact:true})).toHaveCount(0);
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toBeVisible();
});
Then('both split views contain the additional declaration',async function(){
  for(const label of ['Code editor document','Split editor document'])await expect(this.page.getByLabel(label,{exact:true})).toContainText('const extra = true;');
});

Then('the split tab is {string} beside the primary tabs',async function(file){
  const tabs=this.page.getByLabel('Split open files',{exact:true});
  await expect(tabs.getByRole('group',{name:`Split file tab ${file}`,exact:true})).toHaveClass(/active/);
  await expect(tabs.getByRole('button',{name:`Focus split file ${file}`,exact:true})).toBeVisible();
  const left=await this.page.getByLabel('Open files',{exact:true}).boundingBox();
  const right=await tabs.boundingBox();
  const editor=await this.page.getByLabel('Split editor document',{exact:true}).locator('xpath=ancestor::section[1]').boundingBox();
  expect(Math.abs(right.x-editor.x)).toBeLessThan(1);
  expect(Math.abs(left.y-right.y)).toBeLessThan(1);
  expect(right.x).toBeGreaterThan(left.x+left.width-1);
});
When('I activate the split tab {string}',async function(file){
  await this.page.getByRole('button',{name:`Focus split file ${file}`,exact:true}).click();
});
Then('the split document has keyboard focus',async function(){
  await expect(this.page.getByLabel('Split editor document',{exact:true})).toBeFocused();
});
When('I close the split tab {string}',async function(file){
  await this.page.getByRole('button',{name:`Close split file ${file}`,exact:true}).click();await saved(this.page);
});
Then('all editor panes and tabs move together during the split',async function(){
  await expect.poll(()=>this.page.evaluate(()=>window.splitAnimations?.length??0)).toBeGreaterThanOrEqual(4);
  await this.page.evaluate(()=>window.splitAnimations.forEach(animation=>{animation.currentTime=120;}));
  await this.page.screenshot({path:`${this.artifactDirectory}/split-motion-mid.png`});
  const result=await this.page.evaluate(()=>{
    const editors=document.querySelector('[data-split-motion="editors"]');
    const tabs=document.querySelector('[data-split-motion="tabs"]');
    const live=[...document.querySelectorAll('.editor-document > .code-editor, .editor-document > .split-editor')];
    const id=element=>element.dataset.paneId??'primary';
    const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,right:r.right,width:r.width};};
    const order=live.map(id),entering=editors.lastElementChild.dataset.splitImage;
    const shell=(layer,key)=>[...layer.children].find(element=>element.dataset.splitImage===key);
    const frames=[0,120,240].map(time=>{
      window.splitAnimations.forEach(animation=>{animation.currentTime=time;});
      return order.map(key=>{
        const image=shell(editors,key),map=image.querySelector('.cm-minimap-gutter'),scrollbar=image.querySelector('[data-split-scrollbar]');
        return {id:key,editor:rect(image),tabs:rect(shell(tabs,key)),content:rect(image.firstElementChild),
          live:rect(live.find(element=>id(element)===key)),map:map?rect(map):null,scrollbar:scrollbar?rect(scrollbar):null};
      });
    });
    const retained=window.splitLiveEditors.every(element=>live.includes(element));
    window.splitAnimations.forEach(animation=>animation.finish());
    Element.prototype.animate=window.splitAnimationOriginal;
    return {frames,entering,retained};
  });
  expect(result.retained).toBe(true);
  const [start,middle,end]=result.frames;
  expect(start.length).toBeGreaterThanOrEqual(2);
  for(let index=0;index<end.length;index++){
    for(const frame of result.frames){
      const pane=frame[index];
      expect(Math.abs(pane.editor.x-pane.tabs.x)).toBeLessThan(1);
      expect(Math.abs(pane.editor.width-pane.tabs.width)).toBeLessThan(1);
      expect(pane.live).toEqual(end[index].live);
      expect(pane.content.width).toBe(start[index].content.width);
      if(pane.scrollbar)expect(Math.abs(pane.editor.right-pane.scrollbar.right)).toBeLessThan(1);
      if(pane.map&&pane.editor.width>20){
        expect(pane.editor.right-pane.map.right).toBeGreaterThanOrEqual(-1);
        expect(pane.editor.right-pane.map.right).toBeLessThan(16);
      }
      if(index)expect(Math.abs(frame[index-1].editor.right+2-pane.editor.x)).toBeLessThan(3);
    }
    expect(Math.abs(end[index].editor.x-end[index].live.x)).toBeLessThan(1);
    expect(Math.abs(end[index].editor.width-end[index].live.width)).toBeLessThan(1);
  }
  expect(start[0].editor.right).toBeGreaterThan(middle[0].editor.right);
  expect(middle[0].editor.right).toBeGreaterThan(end[0].editor.right);
  const newIndex=end.findIndex(pane=>pane.id===result.entering);
  expect(start[newIndex].editor.width).toBe(0);
  expect(middle[newIndex].editor.width).toBeGreaterThan(0);
  expect(middle[newIndex].editor.width).toBeLessThan(end[newIndex].editor.width);
  await expect(this.page.locator('[data-split-motion]')).toHaveCount(0);
});
When('I request reduced split motion',async function(){await this.page.emulateMedia({reducedMotion:'reduce'});});
Then('the split pane and tab appear without motion',async function(){
  const names=await this.page.locator('.split-editor, .split-file-tabs').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).animationName));
  expect(names).toEqual(['none','none']);
  await expect(this.page.locator('[data-split-motion]')).toHaveCount(0);
});

When('I request animated split motion',async function(){await this.page.emulateMedia({reducedMotion:'no-preference'});});
const paneDocument=(page,index)=>index===1?page.getByLabel('Code editor document',{exact:true}):page.getByLabel('Split editor document',{exact:true}).nth(index-2);
const paneTabs=(page,index)=>index===1?page.getByLabel('Open files',{exact:true}):page.getByLabel('Split open files',{exact:true}).nth(index-2);
When('I split editor pane {int} again',async function(index){
  await paneTabs(this.page,index).locator('.file-tab-select').click({button:'right'});
  await this.page.getByRole('menu').getByRole('menuitem',{name:'Open in split view',exact:true}).click();await saved(this.page);
});
Then('the editor panes show files {string}',async function(files){
  const expected=files.split(',');
  await expect(this.page.locator('.editor-document > .code-editor, .editor-document > .split-editor')).toHaveCount(expected.length);
  await expect.poll(()=>this.page.locator('.editor-tabs > .file-tabs .file-tab.active .file-tab-select').evaluateAll(elements=>elements.map(element=>element.getAttribute('aria-label').replace(/^(?:Switch to |Focus split file )/,'')))).toEqual(expected);
  for(let index=1;index<=expected.length;index++)await expect(paneDocument(this.page,index)).toBeVisible();
  const tabs=await this.page.locator('.editor-tabs > .file-tabs').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().x));
  const editors=await this.page.locator('.editor-document > .code-editor, .editor-document > .split-editor').evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().x));
  for(let index=0;index<tabs.length;index++)expect(Math.abs(tabs[index]-editors[index])).toBeLessThan(1);
});
When('I replace editor pane {int} with {string}',async function(index,text){
  this.beforeSplitEdit=(await repositoryHistories(this.page)).edits.length;
  await paneDocument(this.page,index).click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(text);await saved(this.page);
});
Then('editor panes {int} and {int} contain {string}',async function(first,second,text){
  for(const index of [first,second])await expect(paneDocument(this.page,index)).toHaveText(text);
});
When('I close editor pane {int}',async function(index){
  await paneTabs(this.page,index).locator('.file-tab-close').click();await saved(this.page);
});
When('I give editor panes {int} and {int} different cursor positions',async function(first,second){
  await paneDocument(this.page,first).click();await this.page.keyboard.press('Control+Home');
  await paneDocument(this.page,second).click();await this.page.keyboard.press('Control+End');
});
Then('editor panes {int} and {int} retain different cursor positions',async function(first,second){
  const offsets=[];
  for(const index of [first,second]){
    await paneTabs(this.page,index).locator('.file-tab-select').click();
    offsets.push(await paneDocument(this.page,index).evaluate(element=>{
      const selection=window.getSelection(),range=document.createRange();
      range.selectNodeContents(element);range.setEnd(selection.anchorNode,selection.anchorOffset);return range.toString().length;
    }));
  }
  expect(offsets[0]).toBe(0);expect(offsets[1]).toBeGreaterThan(0);
});
When('I close the primary tab in the multiple-pane editor',async function(){
  await paneTabs(this.page,1).locator('.file-tab-close').click();await saved(this.page);
});
When('I watch the existing split renderer',async function(){
  await this.page.getByLabel('Split editor document',{exact:true}).evaluate(element=>{
    const editor=element.closest('.cm-editor');
    const minimap=editor.querySelector('.cm-minimap-gutter');
    const snapshot=()=>{
      const rect=editor.getBoundingClientRect(),styles=getComputedStyle(element),canvas=minimap.querySelector('canvas');
      const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let hash=0;for(let i=0;i<pixels.length;i++)hash=(hash*31+pixels[i])|0;
      return JSON.stringify({x:rect.x,y:rect.y,width:rect.width,height:rect.height,top:editor.querySelector('.cm-scroller').scrollTop,text:element.innerHTML,font:styles.font,hash});
    };
    const before=snapshot();
    const state=window.splitRenderer={editor,content:element,minimap,before,frames:[],running:true};
    const sample=()=>{if(state.running){state.frames.push(snapshot());requestAnimationFrame(sample);}};
    requestAnimationFrame(sample);
  });
});
Then('the other split keeps its existing editor and minimap',async function(){
  const result=await this.page.getByLabel('Split editor document',{exact:true}).evaluate(element=>{
    const editor=element.closest('.cm-editor'),before=window.splitRenderer;
    before.running=false;
    return {editor:editor===before.editor,content:element===before.content,minimap:editor.querySelector('.cm-minimap-gutter')===before.minimap,
      changedFrames:before.frames.filter(frame=>frame!==before.before)};
  });
  expect(result).toEqual({editor:true,content:true,minimap:true,changedFrames:[]});
  expect(this.diagnostics.filter(item=>item.message?.includes("binding_property_non_reactive"))).toEqual([]);
});
When('I fill the primary pane with long split-test source',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();
  await this.page.keyboard.press('Control+a');
  await this.page.keyboard.insertText(Array.from({length:400},(_,index)=>`function method${index}(value: string) { return value.split(" "); }`).join('\n'));
  await saved(this.page);await this.page.keyboard.press('Control+Home');
});
Then('the right split scrolls and keeps its minimap bounded',async function(){
  const pane=this.page.locator('.split-editor'),scroll=pane.locator('.cm-scroller');
  await expect(pane).toHaveCSS('transform','none');
  const bounds=await scroll.boundingBox();expect(bounds).toBeTruthy();
  const before=await scroll.evaluate(element=>element.scrollTop);
  await this.page.mouse.move(bounds.x+bounds.width/3,bounds.y+bounds.height/2);
  await this.page.mouse.wheel(0,500);
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(before+100);
  const layout=await pane.evaluate(element=>{
    const editor=element.querySelector('.cm-editor'),map=element.querySelector('.cm-minimap-gutter'),overlay=element.querySelector('.cm-minimap-overlay'),canvas=map.querySelector('canvas');
    const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right};};
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return {editor:rect(editor),map:rect(map),overlay:rect(overlay),canvas:rect(canvas),painted:pixels.some((value,index)=>index%4===3&&value>0)};
  });
  expect(layout.painted).toBe(true);expect(layout.map.width).toBeLessThanOrEqual(121);
  expect(layout.overlay.width).toBeLessThanOrEqual(layout.map.width+1);
  expect(layout.canvas.x).toBeGreaterThanOrEqual(layout.map.x-1);
  expect(layout.editor.right-layout.map.right).toBeGreaterThanOrEqual(0);
  expect(layout.editor.right-layout.map.right).toBeLessThan(15);
});

When('I pause split transitions for frame inspection',async function(){
  await this.page.evaluate(()=>{
    window.splitLiveEditors=[...document.querySelectorAll('.editor-document > .code-editor, .editor-document > .split-editor')];
    window.splitAnimationOriginal=Element.prototype.animate;
    window.splitAnimations=[];
    Element.prototype.animate=function(frames,options){
      const animation=window.splitAnimationOriginal.call(this,frames,options);
      if(this.closest('[data-split-motion]')){animation.pause();window.splitAnimations.push(animation);}
      return animation;
    };
  });
});

When('I hold the next read of file {string}',async function(file){
  await this.page.evaluate(file=>{
    const original=Worker.prototype.postMessage;
    Worker.prototype.postMessage=function(message,...options){
      if(message.method==='read'&&message.args?.[1]===file&&!window.releaseSplitRead){
        window.releaseSplitRead=()=>{Worker.prototype.postMessage=original;original.call(this,message,...options);};return;
      }
      return original.call(this,message,...options);
    };
  },file);
});
When('I select primary tab {string} while its read is held',async function(file){
  await this.page.getByRole('button',{name:`Switch to ${file}`,exact:true}).click();
  await expect(this.page.getByRole('region',{name:'Editor',exact:true})).toHaveAttribute('aria-busy','true');
});
Then('the split rejects edits until navigation finishes',async function(){
  const document=this.page.getByLabel('Split editor document',{exact:true});
  const text=await document.innerText();await document.click();await this.page.keyboard.insertText('blocked');
  await expect(document).toHaveText(text.trim());
  await this.page.evaluate(()=>window.releaseSplitRead());await saved(this.page);
  await expect(this.page.getByRole('region',{name:'Editor',exact:true})).toHaveAttribute('aria-busy','false');
  await this.page.keyboard.insertText('allowed');await saved(this.page);await expect(document).toContainText('allowed');
});
