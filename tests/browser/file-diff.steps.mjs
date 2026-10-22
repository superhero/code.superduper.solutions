// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const text='const value = 2;\nconst added = true;';
Then('the diff minimaps match their line change highlights',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});
  for(const side of ['a','b']){
    const pane=region.locator(`.cm-merge-${side}`);
    const expected=await pane.locator('.cm-lineNumbers .cm-diff-changedNumber:visible').evaluateAll(markers=>markers.map(marker=>getComputedStyle(marker).backgroundColor.match(/\d+/g).slice(0,3).map(Number)));
    expect(expected.length).toBeGreaterThan(0);
    const overflow=await pane.locator('.cm-scroller').evaluate(element=>element.scrollHeight>element.clientHeight+1);
    if(!overflow){await expect(pane.locator('.cm-minimap-gutter')).toBeHidden();continue;}

    await expect.poll(()=>pane.locator('.cm-minimap-inner canvas').evaluate((canvas,colors)=>{
      const context=canvas.getContext('2d'),left=context.getImageData(2,0,4,canvas.height).data,right=context.getImageData(canvas.width-6,0,4,canvas.height).data;
      if(!left.every((value,index)=>value===right[index]))return false;
      const background=getComputedStyle(canvas.parentElement).backgroundImage.replace(/\s/g,'');
      return colors.every(color=>{
        let found=false;
        for(let offset=0;offset<left.length;offset+=4)if(left[offset+3]===255&&color.every((value,index)=>Math.abs(value-left[offset+index])<=1)){found=true;break;}
        return found&&background.includes(`rgba(${color.join(',')},0.24)`);
      });
    },expected)).toBe(true);
  }
});
async function observeMotion(page,direction,key){
  await page.evaluate(({direction,key,capture})=>{
    const pane=document.activeElement?.closest('.split-editor, .primary-pane')??
      document.querySelector('.file-diff')?.closest('.split-editor, .primary-pane')??document.querySelector('.primary-pane');
    const source=pane.getBoundingClientRect();
    window[key]={source:{left:source.left,width:source.width},frames:[]};
    const observer=new MutationObserver(async()=>{
      const overlay=document.querySelector(`[data-diff-motion="${direction}"]`);if(!overlay)return;
      observer.disconnect();
      const animations=overlay.getAnimations({subtree:true});
      for(const animation of animations)animation.pause();
      for(const time of [0,120,240]){
        for(const animation of animations)animation.currentTime=time;
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const left=overlay.querySelector('[data-diff-image="committed"]').getBoundingClientRect();
        const right=overlay.querySelector('[data-diff-image="current"]').getBoundingClientRect();
        const current=document.querySelector('.file-diff .cm-merge-b'),live=current.getBoundingClientRect();
        const liveMap=current.querySelector('.cm-minimap-gutter').getBoundingClientRect();
        const scroll=current.querySelector('.cm-scroller');
        const scrollbarWidth=scroll.offsetWidth-scroll.clientWidth;
        const clip=getComputedStyle(overlay).clipPath.match(/inset\(([^)]+)\)/)?.[1].split(/\s+/);
        const exposed=clip?parseFloat(clip[1]??clip[0]):0;
        const scrollbarVisible=getComputedStyle(scroll).visibility==='visible'&&exposed>=scrollbarWidth;
        const committed=document.querySelector('.file-diff .cm-merge-a');
        const committedInset=committed.getBoundingClientRect().right-committed.querySelector('.cm-minimap-gutter').getBoundingClientRect().right;
        const committedEdge=left.right-committedInset;
        const map=overlay.querySelector('[data-diff-image="minimap"]'),canvas=map?.querySelector('canvas');
        const committedMap=overlay.querySelector('[data-diff-image="committed"] .cm-minimap-gutter').getBoundingClientRect();
        const pinnedMap=map.querySelector('.cm-minimap-gutter').getBoundingClientRect();
        const committedCanvas=overlay.querySelector('[data-diff-image="committed"] canvas').getBoundingClientRect();
        const pinnedCanvas=canvas.getBoundingClientRect();
        const painted=canvas&&[...canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data].some((value,index)=>index%4===3&&value>0);
        window[key].frames.push({leftLeft:left.left,leftWidth:left.width,rightLeft:right.left,rightWidth:right.width,liveWidth:live.width,mapRight:map?.getBoundingClientRect().right,liveMapRight:liveMap.right,mapPainted:Boolean(painted),committedMapGap:Math.abs(committedMap.right-committedEdge),pinnedMapGap:Math.abs(pinnedMap.right-map.getBoundingClientRect().right),canvasGap:Math.max(Math.abs(committedCanvas.right-committedEdge),Math.abs(pinnedCanvas.right-map.getBoundingClientRect().right)),scrollbarVisible});
        if(time===120&&capture){window.diffMotionPaused=true;await new Promise(resolve=>{window.resumeDiffMotion=resolve;});window.diffMotionPaused=false;}
      }
      for(const animation of animations)animation.finish();
    });
    observer.observe(document.body,{subtree:true,childList:true});
  },{direction,key,capture:direction==='open'&&Boolean(process.env.DIFF_MOTION_SCREENSHOTS)});
}
When('I close the file diff while observing its return',async function(){
  await observeMotion(this.page,'close','diffReturn');
  await this.page.getByRole('button',{name:'Close file diff',exact:true}).click();
});
Then('the committed pane slides away and the current view expands back',async function(){
  await expect(this.page.getByRole('region',{name:'File diff',exact:true})).toHaveCount(0);
  const {frames}=await this.page.evaluate(()=>window.diffReturn);
  expect(frames).toHaveLength(3);
  expect(frames[1].rightLeft).toBeLessThan(frames[0].rightLeft);
  expect(frames[2].leftLeft).toBeLessThan(frames[0].leftLeft-frames[0].leftWidth*.9);
  expect(Math.abs(frames[2].rightWidth-frames[0].rightWidth)).toBeLessThan(1);
  expect(Math.abs(frames[2].liveWidth-frames[0].liveWidth)).toBeLessThan(1);
  expect(frames.every(frame=>frame.mapPainted&&Math.abs(frame.mapRight-frames[0].mapRight)<1&&Math.abs(frame.mapRight-frame.liveMapRight)<1)).toBe(true);
  expect(frames.every(frame=>frame.committedMapGap<2&&frame.pinnedMapGap<2&&frame.canvasGap<2)).toBe(true);
  expect(frames.every(frame=>frame.scrollbarVisible)).toBe(true);
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toBeVisible();
});
When('I open the file diff while observing its reveal',async function(){
  await this.page.emulateMedia({reducedMotion:'no-preference'});
  await observeMotion(this.page,'open','diffReveal');
  await this.page.getByRole('button',{name:'Open file diff',exact:true}).click();
  if(process.env.DIFF_MOTION_SCREENSHOTS){
    await expect.poll(()=>this.page.evaluate(()=>window.diffMotionPaused)).toBe(true);
    await this.page.screenshot({path:'/tmp/code-diff-open-mid.png'});
    await this.page.evaluate(()=>window.resumeDiffMotion());
  }
});
Then('the committed pane slides in and the current pane moves to the right',async function(){
  await expect.poll(()=>this.page.evaluate(()=>window.diffReveal.frames.length)).toBe(3);
  const {source,frames}=await this.page.evaluate(()=>window.diffReveal);
  expect(Math.abs(frames[0].rightLeft-source.left)).toBeLessThan(4);
  expect(frames[0].rightWidth).toBeGreaterThan(source.width*.95);
  expect(frames[1].leftLeft).toBeGreaterThan(frames[0].leftLeft);
  expect(frames[2].rightLeft).toBeGreaterThan(frames[0].rightLeft+source.width*.4);
  expect(Math.abs(frames[2].rightWidth-frames[0].rightWidth)).toBeLessThan(1);
  expect(Math.abs(frames[2].liveWidth-frames[0].liveWidth)).toBeLessThan(1);
  expect(frames.every(frame=>frame.mapPainted&&Math.abs(frame.mapRight-frames[0].mapRight)<1&&Math.abs(frame.mapRight-frame.liveMapRight)<1)).toBe(true);
  expect(frames.every(frame=>frame.committedMapGap<2&&frame.pinnedMapGap<2&&frame.canvasGap<2)).toBe(true);
  expect(frames.every(frame=>frame.scrollbarVisible)).toBe(true);
  await expect(this.page.getByLabel('Current file',{exact:true})).toHaveAttribute('contenteditable','true');
  for(const side of ['a','b']){
    const geometry=await this.page.locator(`.file-diff .cm-merge-${side}`).evaluate(element=>{
      const pane=element.getBoundingClientRect(),map=element.querySelector('.cm-minimap-gutter').getBoundingClientRect();
      return {right:Math.abs(map.right-pane.right),onRight:map.left>pane.left+pane.width/2};
    });
    expect(geometry.onRight).toBe(true);expect(geometry.right).toBeLessThan(15);
  }
});
When('I scroll inside the editor with an earlier block folded',async function(){
  await expect(this.page.locator('#app')).not.toHaveAttribute('inert','');
  const editor=this.page.locator('.editor-document .cm-editor');
  await editor.getByRole('group',{name:'Document minimap',exact:true}).focus();await this.page.keyboard.press('Home');
  await expect.poll(()=>editor.locator('.cm-scroller').evaluate(element=>element.scrollTop)).toBe(0);
  await editor.locator('.cm-foldGutter [title="Fold line"]:visible').first().click();
  await expect(editor.locator('.cm-foldPlaceholder')).toHaveCount(1);
  const scroll=editor.locator('.cm-scroller');
  await scroll.evaluate(element=>{element.scrollTop=800;});
  await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBe(800);
  await expect.poll(()=>scroll.evaluate(element=>[...element.querySelectorAll('.cm-line')].some(line=>{
    const box=line.getBoundingClientRect();return box.bottom>element.getBoundingClientRect().top&&box.top<element.getBoundingClientRect().bottom;
  }))).toBe(true);
  this.diffLocation=await scroll.evaluate(element=>{
    const top=element.getBoundingClientRect().top;
    const line=[...element.querySelectorAll('.cm-line')].find(line=>line.getBoundingClientRect().bottom>top);
    return {text:line.textContent,offset:line.getBoundingClientRect().top-top};
  });
});
Then('the diff opens at the same visible document location',async function(){
  const pane=this.page.getByRole('region',{name:'File diff',exact:true}).locator('.cm-merge-b');
  await expect.poll(()=>pane.evaluate((element,location)=>{
    const scroll=element.querySelector('.cm-scroller');
    const line=[...element.querySelectorAll('.cm-line')].find(line=>line.textContent===location.text);
    return Boolean(line)&&Math.abs(line.getBoundingClientRect().top-scroll.getBoundingClientRect().top-location.offset)<3;
  },this.diffLocation)).toBe(true);
});
Then('either diff minimap supports clicking dragging and keyboard scrolling',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});
  for(const side of ['a','b']){
    const pane=region.locator(`.cm-merge-${side}`),map=pane.getByRole('group',{name:'Document minimap',exact:true});
    const scroll=pane.locator('.cm-scroller');
    await expect(map).toBeVisible();await map.focus();await this.page.keyboard.press('Home');
    await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBe(0);
    const box=await map.boundingBox();
    await this.page.mouse.move(box.x+box.width/2,box.y+box.height*.65);
    await this.page.mouse.down();
    await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(100);
    const before=await scroll.evaluate(element=>element.scrollTop);
    await this.page.mouse.move(box.x+box.width/2,box.y+box.height*.8,{steps:5});await this.page.mouse.up();
    await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(before);
    await expect.poll(()=>region.locator('.cm-scroller').evaluateAll(elements=>Math.abs(elements[0].scrollTop-elements[1].scrollTop))).toBeLessThan(1);
    await map.focus();await this.page.keyboard.press('Home');
    await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBe(0);
    await this.page.keyboard.press('End');
    await expect.poll(()=>scroll.evaluate(element=>element.scrollTop+element.clientHeight>=element.scrollHeight-1)).toBe(true);
  }
});
Then('both diff panes can fold and unfold code without changing files',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});
  for(const side of ['a','b']){
    const pane=region.locator(`.cm-merge-${side}`);
    await pane.getByRole('group',{name:'Document minimap',exact:true}).focus();await this.page.keyboard.press('Home');
    await expect.poll(()=>pane.locator('.cm-scroller').evaluate(element=>element.scrollTop)).toBe(0);
    const fold=pane.locator('.cm-foldGutter [title="Fold line"]').first();
    await expect(fold).toBeVisible();await fold.click();
    await expect(pane.locator('.cm-foldPlaceholder')).toHaveCount(1);
    // A folded side is shorter: synchronizing its clamped scroll position must
    // not pull the expanded side back before it reaches the end.
    const other=region.locator(`.cm-merge-${side==='a'?'b':'a'}`);
    await other.getByRole('group',{name:'Document minimap',exact:true}).focus();await this.page.keyboard.press('End');
    await expect.poll(()=>other.locator('.cm-scroller').evaluate(element=>element.scrollTop+element.clientHeight>=element.scrollHeight-1)).toBe(true);
    await pane.getByRole('group',{name:'Document minimap',exact:true}).focus();await this.page.keyboard.press('Home');
    await expect.poll(()=>pane.locator('.cm-scroller').evaluate(element=>element.scrollTop)).toBe(0);
    await pane.locator('.cm-foldGutter [title="Unfold line"]:visible').first().click();
    await expect(pane.locator('.cm-foldPlaceholder')).toHaveCount(0);
    await expect(pane.locator('.cm-content')).toContainText('function sample()');
  }
  await expect(this.page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
});
When('I prepare a long file for scrolling the diff',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();
  await this.page.keyboard.insertText('function sample() {\n'+Array.from({length:250},(_,index)=>`  const line${index} = ${index};`).join('\n')+'\n}\nfunction tail() {\n'+Array.from({length:150},(_,index)=>`  const tail${index} = ${index};`).join('\n')+'\n}\nconst end = true;');
  await saved(this.page);
});
Then('scrolling either diff pane moves both sides together without scrolling the page',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});
  const scroll=region.locator('.cm-merge-a .cm-scroller');
  await expect(this.page.locator('.editor-status')).toHaveCount(0);
  await expect(this.page.getByLabel('Committed file',{exact:true})).toBeVisible();
  await expect.poll(()=>scroll.evaluate(element=>element.scrollHeight>element.clientHeight+100)).toBe(true);
  await expect(region.locator('.cm-diff-changedNumber')).toHaveCount(0);
  const backgrounds=await region.locator('.cm-lineNumbers .cm-gutterElement').first().evaluate(element=>({
    number:getComputedStyle(element).backgroundColor,
    editor:getComputedStyle(element.closest('.cm-editor')).backgroundColor
  }));
  expect(backgrounds.number).toBe(backgrounds.editor);
  for(const label of ['Committed file','Current file']){
    await region.locator('.cm-scroller').evaluateAll(elements=>elements.forEach(element=>{element.scrollTop=0;}));
    const box=await region.getByLabel(label,{exact:true}).boundingBox();
    const viewport=await scroll.boundingBox();
    await this.page.mouse.move(box.x+box.width/2,viewport.y+60);
    await this.page.mouse.wheel(0,400);
    await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(100);
    await expect.poll(()=>region.locator('.cm-scroller').evaluateAll(elements=>Math.abs(elements[0].scrollTop-elements[1].scrollTop))).toBeLessThan(1);
    expect(await this.page.evaluate(()=>window.scrollY)).toBe(0);
  }
});
When('I prepare changed contents for the file diff',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(text);await saved(this.page);
});
When('I click the file diff toolbar button',async function(){
  const close=this.page.getByRole('button',{name:'Close file diff',exact:true});
  await (await close.count()?close:this.page.getByRole('button',{name:'Open file diff',exact:true})).click();await saved(this.page);
});
Then('the file diff shows committed contents read-only and current contents editable',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});await expect(region).toBeVisible();
  await expect(this.page.getByLabel('Committed file',{exact:true})).toHaveText('const value = 1;');
  await expect(this.page.getByLabel('Current file',{exact:true})).toHaveText(text.replaceAll('\n',''));
  await expect(this.page.getByLabel('Committed file',{exact:true})).toHaveAttribute('contenteditable','false');
  await expect(this.page.getByLabel('Current file',{exact:true})).toHaveAttribute('contenteditable','true');
  await expect(region.locator('.cm-changedText').first()).toBeVisible();
  for(const [side,color] of [['a','modified'],['b','modified']]){
    const number=region.locator(`.cm-merge-${side} .cm-lineNumbers .cm-diff-changedNumber`).first();
    await expect(number).toBeVisible();
    expect(await number.evaluate((element,color)=>{
      const style=getComputedStyle(element),probe=document.createElement('span');
      probe.style.color=element.classList.contains('cm-activeLineGutter')?`color-mix(in srgb,var(--color-git-${color}) 65%,var(--color-surface))`:`var(--color-git-${color})`;element.append(probe);
      const expected=getComputedStyle(probe).color;probe.remove();
      return style.backgroundColor===expected;
    },color)).toBe(true);
  }
  await expect(region.locator('.cm-merge-b .cm-lineNumbers .cm-diff-added')).toHaveCount(1);
  const activeChangedRows=region.locator('.cm-line.cm-diff-changedLine.cm-activeLine');
  expect(await activeChangedRows.count()).toBeGreaterThan(0);
  for(const line of await activeChangedRows.all()) {
    expect(await line.evaluate(element=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const drawing=canvas.getContext('2d');drawing.fillStyle=getComputedStyle(element).backgroundColor;drawing.fillRect(0,0,1,1);
      return Math.abs(drawing.getImageData(0,0,1,1).data[3]-64)<=1;
    })).toBe(true);
  }
  await expect(region.locator('.cm-changeGutter')).toHaveCount(0);
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toBeHidden();
  await expect(this.page.getByRole('button',{name:'Close file diff',exact:true})).toHaveAttribute('aria-pressed','true');
});
When('I reload the open file diff',async function(){await this.page.reload({waitUntil:'networkidle'});await saved(this.page);});
Then('the normal editor is visible with the current file contents',async function(){
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toBeVisible();
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toHaveText(text.replaceAll('\n',''));
  await expect(this.page.getByRole('region',{name:'File diff',exact:true})).toHaveCount(0);
});
Then('the file diff has an empty committed side and the new file contents',async function(){
  await expect(this.page.getByLabel('Committed file',{exact:true})).toHaveText('');
  await expect(this.page.getByLabel('Current file',{exact:true})).toHaveText('const fresh = true;');
});

Then('both diff panes slide their code folds open and closed',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});
  for(const side of ['a','b']){
    const pane=region.locator(`.cm-merge-${side}`);
    for(const opening of [false,true]){
      const marker=pane.locator(`.cm-foldGutter [title="${opening?'Unfold':'Fold'} line"]:visible`).first();
      await expect(marker).toBeVisible();
      const heights=await marker.evaluate(async element=>{
        const editor=element.closest('.cm-editor');element.click();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const overlay=editor.querySelector('.cm-fold-motion');
        if(!overlay)throw new Error('Expected a sliding fold in the diff pane');
        const animations=overlay.getAnimations({subtree:true});
        const body=overlay.querySelector('[data-fold-part="body"]');
        const animation=animations.find(value=>value.effect.target===body);
        const frames=animation.effect.getKeyframes();
        const result=[Number(body.dataset.oldHeight),Number(body.dataset.newHeight)];
        animations.forEach(value=>value.finish());return result;
      });
      expect(opening?heights[1]>heights[0]:heights[0]>heights[1]).toBe(true);
      await expect(pane.locator('.cm-fold-motion')).toHaveCount(0);
    }
  }
});

Then('both diff sides use the normal editor selection appearance',async function(){
  for(const label of ['Committed file','Current file']){
    const content=this.page.getByLabel(label,{exact:true});
    await content.focus();await this.page.keyboard.press('ControlOrMeta+Home');
    const activeBefore=await content.locator('.cm-activeLine').evaluateAll(lines=>lines.map(line=>getComputedStyle(line).backgroundColor));
    for(let i=0;i<5;i++)await this.page.keyboard.press('Shift+ArrowRight');
    const root=content.locator('..');
    const selection=root.locator('.cm-joinedSelectionLayer .cm-selectionBackground');
    await expect(selection).toHaveCount(1);await expect(selection).toBeVisible();
    expect(await selection.evaluate(element=>{
      const editor=element.closest('.cm-editor'),probe=document.createElement('span');
      probe.style.backgroundColor='color-mix(in srgb, var(--color-foreground) 20%, transparent)';editor.append(probe);
      const expected=getComputedStyle(probe).backgroundColor;probe.remove();
      const style=getComputedStyle(element),box=element.getBoundingClientRect();
      return {correctColor:style.backgroundColor===expected,bounded:box.right<editor.getBoundingClientRect().right-20,
        borders:style.boxShadow!=='none',nativeHidden:[...editor.querySelectorAll('.cm-selectionLayer > .cm-selectionBackground')].every(node=>getComputedStyle(node).display==='none')};
    })).toEqual({correctColor:true,bounded:true,borders:true,nativeHidden:true});
    const activeAfter=await content.locator('.cm-activeLine').evaluateAll(lines=>lines.map(line=>getComputedStyle(line).backgroundColor));
    expect(activeAfter).toEqual(activeBefore);
    if(label==='Current file'){
      expect(activeAfter.length).toBeGreaterThan(0);
      expect(activeAfter).not.toContain('rgba(0, 0, 0, 0)');
    }
  }
});

Then('the diff active row has a continuous gutter highlight',async function(){
  const current=this.page.getByLabel('Current file',{exact:true});await current.focus();
  const pane=this.page.getByRole('region',{name:'File diff',exact:true}).locator('.cm-merge-b');
  const number=pane.locator('.cm-lineNumbers .cm-activeLineGutter'),fold=pane.locator('.cm-foldGutter .cm-activeLineGutter');
  await expect(number).toBeVisible();await expect(fold).toBeVisible();
  await expect.poll(async()=>{
    const numberColor=await number.evaluate(node=>getComputedStyle(node).backgroundColor);
    const foldColor=await fold.evaluate(node=>getComputedStyle(node).backgroundColor);
    const background=await pane.evaluate(node=>getComputedStyle(node).backgroundColor);
    return numberColor===foldColor&&numberColor!==background;
  }).toBe(true);
});

Then('the diff current side matches the committed baseline',async function(){
  const diff=this.page.getByRole('region',{name:'File diff',exact:true});await expect(diff).toBeVisible();
  await expect(diff.getByLabel('Current file',{exact:true})).toHaveText('const value = 1;');
  await expect(diff.getByLabel('Committed file',{exact:true})).toHaveText('const value = 1;');
});
Then('file history Undo and Redo are unavailable',async function(){
  await saved(this.page);
  for(const label of ['Undo','Redo'])await expect(this.page.getByRole('button',{name:label,exact:true})).toBeDisabled();
});

When('I prepare separated diff blocks with an alignment gap on the {string} side',async function(side){
  const before=`function example() {
  try {
    socket.write('old');
  } catch (error) {
    socket.write('old value');
  }
  const stable = true;
  const close = () => socket.destroy();
  return close;
}`;
  const after=before.replace("socket.write('old value');","socket.write('new value');\n    const one = 1;\n    const two = 2;")
    .replace('const close = () => socket.destroy();','const close = () => socket.end();');
  this.diffGapSide=side==='committed'?'a':'b';this.diffGapContents=side==='committed'?after:before;
  await this.page.getByLabel('Code editor document',{exact:true}).fill(side==='committed'?before:after);await saved(this.page);
});
When('I apply the separated diff block changes',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).fill(this.diffGapContents);await saved(this.page);
});
Then('changed diff rows have continuous inner borders across both gutters',async function(){
  const region=this.page.getByRole('region',{name:'File diff',exact:true});
  await expect(region.locator(`.cm-merge-${this.diffGapSide} .cm-mergeSpacer`).filter({visible:true}).first()).toBeVisible();
  const {default:sharp}=await import('sharp');
  for(const side of ['a','b']){
    const rows=await region.locator(`.cm-merge-${side} .cm-content > .cm-diff-changedLine`).evaluateAll(lines=>lines.map(line=>{
      const kind=['modified','added','removed'].find(kind=>line.classList.contains(`cm-diff-${kind}`));
      const rect=line.getBoundingClientRect(),editor=line.closest('.cm-editor');
      const probe=document.createElement('span');probe.style.backgroundColor='color-mix(in srgb,var(--color-surface) 20%,var(--color-background))';editor.append(probe);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
      context.fillStyle=getComputedStyle(probe).backgroundColor;context.fillRect(0,0,1,1);probe.remove();
      const color=[...context.getImageData(0,0,1,1).data].slice(0,3);
      return {top:rect.top,bottom:rect.bottom,kind,topEdge:getComputedStyle(line).getPropertyValue('--change-edge-top').trim(),
        bottomEdge:getComputedStyle(line).getPropertyValue('--change-edge-bottom').trim(),color};
    }));
    expect(rows.length).toBeGreaterThan(1);
    for(const row of rows)for(const gutter of ['cm-lineNumbers','cm-foldGutter']){
      const cells=await region.locator(`.cm-merge-${side} .${gutter} > .cm-diff-changedNumber`).evaluateAll((cells,row)=>cells.map(cell=>{
        const rect=cell.getBoundingClientRect(),css=getComputedStyle(cell);
        return {x:rect.x,width:rect.width,top:rect.top,bottom:rect.bottom,kind:cell.classList.contains(`cm-diff-${row.kind}`),
          topEdge:css.getPropertyValue('--change-edge-top').trim(),bottomEdge:css.getPropertyValue('--change-edge-bottom').trim()};
      }).filter(cell=>Math.abs(cell.top-row.top)<.1),row);
      expect(cells).toHaveLength(1);const [cell]=cells;
      expect(cell.kind).toBe(true);expect(Math.abs(cell.bottom-row.bottom)).toBeLessThan(.1);
      expect(cell.topEdge).toBe(row.topEdge);expect(cell.bottomEdge).toBe(row.bottomEdge);
      for(const [enabled,y] of [[row.topEdge==='1px',row.top],[row.bottomEdge==='-1px',row.bottom-1]])if(enabled){
        const image=await this.page.screenshot({clip:{x:Math.floor(cell.x+cell.width-2),y:Math.floor(y)-1,width:1,height:3}});
        const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
        expect(Array.from({length:info.height},(_,index)=>row.color.every((value,channel)=>Math.abs(data[index*info.channels+channel]-value)<=2)).some(Boolean)).toBe(true);
      }
    }
  }
});
