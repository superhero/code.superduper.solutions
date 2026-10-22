// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then,When} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const before='const alpha = 1;\nconst beta = 2;\nconst end = 3;';
const after='const alpha = 9;\nconst beta = 2;\nconst fresh = 4;\nconst end = 3;';
const marks=(page,kind)=>page.locator(`.cm-lineNumbers ${kind==='removed'?'.cm-git-deletion-boundary':`.cm-git-${kind}`}:visible`);
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
async function hasScrollableMinimap(page){
  const overflow=await page.locator('.editor-document .cm-scroller').evaluate(element=>element.scrollHeight>element.clientHeight+1);
  if(!overflow)await expect(page.locator('.cm-minimap-gutter')).toBeHidden();
  return overflow;
}

Then('an uncommitted new file shows added line markers',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();await this.page.keyboard.insertText(before);await saved(this.page);
  await expect(marks(this.page,'added')).toHaveCount(3);await expect(marks(this.page,'modified')).toHaveCount(0);
  await expect.poll(()=>marks(this.page,'added').first().evaluate(marker=>{
    const style=getComputedStyle(marker);
    return style.backgroundColor.match(/\d+/g).join(',')===style.getPropertyValue('--syntax-string').match(/\d+/g).join(',');
  })).toBe(true);
});
Then('the Git line change gutter is clear',async function(){
  await expect(marks(this.page,'added')).toHaveCount(0);await expect(marks(this.page,'modified')).toHaveCount(0);await expect(marks(this.page,'removed')).toHaveCount(0);
  expect(await this.page.locator('.editor-document .cm-lineNumbers .cm-gutterElement').first().evaluate(element=>
    getComputedStyle(element).backgroundColor===getComputedStyle(element.closest('.cm-editor')).backgroundColor
  )).toBe(true);
});
When('I modify one committed line and insert another',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(after);await saved(this.page);
});
Then('the Git gutter shows one modified and one added line',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).press('Control+End');
  await expect(marks(this.page,'added')).toHaveCount(1);await expect(marks(this.page,'modified')).toHaveCount(1);
  await expect(marks(this.page,'modified')).toHaveCSS('background-color','rgb(214, 181, 66)');
  for(const kind of ['added','modified']){
    const number=marks(this.page,kind);
    const folding=this.page.locator(`.editor-document .cm-foldGutter .cm-git-${kind}`);
    await expect(folding).toHaveCount(1);
    await expect(folding).toHaveCSS('background-color',await number.evaluate(element=>getComputedStyle(element).backgroundColor));
  }
  for(const kind of ['added','modified']){
    const line=this.page.locator(`.editor-document .cm-line.cm-git-${kind}-line`);
    await expect(line).toHaveCount(1);
    expect(await line.evaluate((element,kind)=>{
      const probe=document.createElement('span');probe.style.backgroundColor=`color-mix(in srgb,var(--color-git-${kind}) 15%,transparent)`;
      element.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();
      return getComputedStyle(element).backgroundColor===expected;
    },kind)).toBe(true);
  }
  for(const kind of ['added','modified']){
    const line=this.page.locator(`.editor-document .cm-line.cm-git-${kind}-line`);
    await line.click();
    await expect(line).toHaveClass(/cm-activeLine/);
    const numberColor=await marks(this.page,kind).evaluate(element=>getComputedStyle(element).backgroundColor);
    expect(numberColor).not.toBe(await line.evaluate(element=>getComputedStyle(element).backgroundColor));
    await expect(this.page.locator(`.editor-document .cm-foldGutter .cm-git-${kind}`)).toHaveCSS('background-color',numberColor);
    expect(await line.evaluate((element,kind)=>{
      const probe=document.createElement('span');probe.style.backgroundColor=`color-mix(in srgb,color-mix(in srgb,var(--color-git-${kind}) 30%,var(--syntax-activeLine, var(--color-surface))) 25%,transparent)`;
      element.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();
      const actual=getComputedStyle(element).backgroundColor;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const drawing=canvas.getContext('2d');drawing.fillStyle=actual;drawing.fillRect(0,0,1,1);
      return actual===expected&&Math.abs(drawing.getImageData(0,0,1,1).data[3]-64)<=1;
    },kind)).toBe(true);
  }
  await this.page.getByLabel('Code editor document',{exact:true}).press('Control+End');
});

Then('the minimap shows the same Git line change colors',async function(){
  if(!await hasScrollableMinimap(this.page))return;
  const expected=await this.page.locator('.cm-lineNumbers .cm-git-line-marker:visible:not(.cm-git-deletion-boundary)').evaluateAll(markers=>markers.map(marker=>getComputedStyle(marker).backgroundColor.match(/\d+/g).slice(0,3).map(Number)));
  await expect.poll(()=>this.page.locator('.cm-minimap-inner canvas').evaluate((canvas,expected)=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,8,canvas.height).data;
    const left=canvas.getContext('2d').getImageData(2,0,4,canvas.height).data;
    const right=canvas.getContext('2d').getImageData(canvas.width-6,0,4,canvas.height).data;
    if(!left.every((value,index)=>value===right[index]))return false;
    return expected.every(color=>{
      for(let offset=0;offset<pixels.length;offset+=4)if(pixels[offset+3]===255&&color.every((value,index)=>Math.abs(value-pixels[offset+index])<=1))return true;
      return false;
    });
  },expected)).toBe(true);
});
Then('the minimap Git change strip is clear',async function(){
  if(!await hasScrollableMinimap(this.page))return;
  await expect.poll(()=>this.page.locator('.cm-minimap-inner canvas').evaluate(canvas=>{
    const context=canvas.getContext('2d');
    const strips=[context.getImageData(2,0,4,canvas.height).data,context.getImageData(canvas.width-6,0,4,canvas.height).data];
    for(const pixels of strips)for(let offset=3;offset<pixels.length;offset+=4)if(pixels[offset]>0)return false;
    return true;
  })).toBe(true);
});

When('I delete a committed line',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(after.replace('const beta = 2;\n',''));await saved(this.page);
});
Then('a red deletion marker appears in the gutter and minimap',async function(){
  await expect(marks(this.page,'removed')).toHaveCount(1);
  for(const selector of ['.cm-lineNumbers','.cm-foldGutter','.cm-content']){
    const boundary=this.page.locator(`.editor-document ${selector} .cm-git-deletion-boundary`);
    await expect(boundary).toHaveCount(1);
    expect(await boundary.evaluate(element=>{
      const rule=getComputedStyle(element);
      return rule.backgroundColor==='rgb(216, 91, 85)'&&rule.height==='4px'&&rule.boxShadow.includes('inset');
    })).toBe(true);
  }
  const spacing=await this.page.locator('.cm-content > .cm-git-deletion-boundary').evaluate(element=>({height:element.getBoundingClientRect().height,previous:element.previousElementSibling.getBoundingClientRect().bottom,top:element.getBoundingClientRect().top,bottom:element.getBoundingClientRect().bottom,next:element.nextElementSibling.getBoundingClientRect().top}));
  expect(spacing.height).toBe(4);expect(Math.abs(spacing.previous-spacing.top)).toBeLessThan(1);expect(Math.abs(spacing.next-spacing.bottom)).toBeLessThan(1);
  await expect(this.page.locator('.editor-document .cm-git-removed-line')).toHaveCount(0);
  if(!await hasScrollableMinimap(this.page))return;
  await expect.poll(()=>this.page.locator('.cm-minimap-inner canvas').evaluate(canvas=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,8,canvas.height).data;
    for(let offset=0;offset<pixels.length;offset+=4)if(pixels[offset+3]===255&&Math.abs(pixels[offset]-216)<2&&Math.abs(pixels[offset+1]-91)<2&&Math.abs(pixels[offset+2]-85)<2)return true;
    return false;
  })).toBe(true);
});

Then('the minimap highlights changed rows across their full width',async function(){
  if(!await hasScrollableMinimap(this.page))return;
  const expected=await this.page.locator('.cm-lineNumbers .cm-git-line-marker:visible:not(.cm-git-deletion-boundary)').evaluateAll(markers=>markers.map(marker=>getComputedStyle(marker).backgroundColor.match(/\d+/g).slice(0,3).map(Number)));
  await expect.poll(()=>this.page.locator('.cm-minimap-inner').evaluate((inner,expected)=>{
    const canvas=inner.querySelector('canvas'),style=getComputedStyle(inner);
    if(inner.getBoundingClientRect().width<canvas.getBoundingClientRect().width-1)return false;
    const background=style.backgroundImage.replace(/\s/g,'');
    return expected.every(color=>background.includes(`rgba(${color.join(',')},0.24)`));
  },expected)).toBe(true);
});

Then('changed blocks have one pixel inner edges matching the minimap background',async function(){
  const results=await this.page.locator('.editor-document .cm-line.cm-git-changedLine').evaluateAll(elements=>elements.map(element=>{
    const css=getComputedStyle(element),kind=element.classList.contains('cm-git-added-line')?'cm-git-added-line':'cm-git-modified-line';
    const reference=document.createElement('span');reference.style.backgroundColor='color-mix(in srgb,var(--color-surface) 20%,var(--color-background))';element.closest('.cm-editor').append(reference);
    const color=getComputedStyle(reference).backgroundColor;reference.remove();
    return {top:css.getPropertyValue('--change-edge-top').trim(),bottom:css.getPropertyValue('--change-edge-bottom').trim(),
      expectedTop:element.previousElementSibling?.classList.contains(kind)?'0px':'1px',expectedBottom:element.nextElementSibling?.classList.contains(kind)?'0px':'-1px',shadow:css.boxShadow,color};
  }));
  expect(results.length).toBeGreaterThan(0);
  for(const result of results){expect(result.top).toBe(result.expectedTop);expect(result.bottom).toBe(result.expectedBottom);expect(result.shadow).toContain(result.color);}
});

When('I delete the final committed line',async function(){
  const input=this.page.getByLabel('Code editor document',{exact:true});await input.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('const alpha = 1;\nconst beta = 2;');await saved(this.page);
});
Then('the deletion marker occupies its own space after the final line',async function(){
  const marker=this.page.locator('.cm-content > .cm-git-deletion-boundary');await expect(marker).toHaveCount(1);
  const geometry=await marker.evaluate(element=>({height:element.getBoundingClientRect().height,top:element.getBoundingClientRect().top,previous:element.previousElementSibling.getBoundingClientRect().bottom,nextText:element.nextElementSibling?.textContent??''}));
  expect(geometry.height).toBe(4);expect(Math.abs(geometry.top-geometry.previous)).toBeLessThan(1);expect(geometry.nextText).toBe('');
  await expect(this.page.locator('.cm-lineNumbers .cm-git-deletion-boundary')).toHaveCount(1);
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toHaveText('const alpha = 1;const beta = 2;');
});

Then('the deletion marker and active row share a two pixel separator',async function(){
  const contentMarker=this.page.locator('.cm-content > .cm-git-deletion-boundary');
  const point=await contentMarker.evaluate(element=>{const rect=element.nextElementSibling.getBoundingClientRect();return {x:rect.left+20,y:rect.top+rect.height/2};});
  await this.page.mouse.click(point.x,point.y);
  await expect(this.page.locator('.cm-content .cm-activeLine')).toBeVisible();
  for(const scope of ['.cm-content','.cm-lineNumbers','.cm-foldGutter']){
  const marker=this.page.locator(`${scope} > .cm-git-deletion-boundary`);
  const geometry=await marker.evaluate(element=>{
    const next=element.nextElementSibling,rect=element.getBoundingClientRect(),row=next.getBoundingClientRect();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
    const probe=document.createElement('span');probe.style.backgroundColor='color-mix(in srgb,var(--color-surface) 20%,var(--color-background))';element.closest('.cm-editor').append(probe);
    context.fillStyle=getComputedStyle(probe).backgroundColor;context.fillRect(0,0,1,1);const color=[...context.getImageData(0,0,1,1).data].slice(0,3);probe.remove();
    return {bottom:rect.bottom,top:row.top,active:next.classList.contains('cm-activeLine')||next.classList.contains('cm-activeLineGutter'),markerShadow:getComputedStyle(element).boxShadow,rowShadow:getComputedStyle(next).boxShadow,x:row.left+1,color};
  });
  expect(geometry.active).toBe(true);expect(Math.abs(geometry.bottom-geometry.top)).toBeLessThan(.1);
  const image=await this.page.screenshot({clip:{x:Math.floor(geometry.x),y:Math.floor(geometry.top)-3,width:1,height:6}});
  const {default:sharp}=await import('sharp');const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
  let matching=0;for(let y=0;y<info.height;y++){if(geometry.color.every((value,index)=>Math.abs(data[y*info.channels+index]-value)<=1))matching++;}
  expect(matching,JSON.stringify({scope,geometry,pixels:[...data],channels:info.channels})).toBeGreaterThanOrEqual(2);
  }
});

Then('active and changed rows have two pixel gutter separators above and below',async function(){
  await this.page.locator('.cm-content > .cm-line').nth(1).click();
  const color=await this.page.locator('.cm-editor').evaluate(element=>{
    const probe=document.createElement('span');probe.style.backgroundColor='color-mix(in srgb,var(--color-surface) 20%,var(--color-background))';element.append(probe);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(probe).backgroundColor;context.fillRect(0,0,1,1);probe.remove();return [...context.getImageData(0,0,1,1).data].slice(0,3);
  });
  const {default:sharp}=await import('sharp');
  for(const scope of ['.cm-content','.cm-lineNumbers','.cm-foldGutter']){
    const row=this.page.locator(`${scope} > :is(.cm-activeLine,.cm-activeLineGutter)`);
    await expect(row).toHaveCount(1);
    const rect=await row.boundingBox();
    for(const y of [rect.y,rect.y+rect.height]){
      const image=await this.page.screenshot({clip:{x:Math.floor(rect.x+1),y:Math.floor(y)-3,width:1,height:6}});
      const {data,info}=await sharp(image).raw().toBuffer({resolveWithObject:true});
      let matching=0;for(let i=0;i<info.height;i++)if(color.every((value,index)=>Math.abs(data[i*info.channels+index]-value)<=1))matching++;
      expect(matching,`${scope} at ${y}: ${JSON.stringify([...data])}`).toBeGreaterThanOrEqual(2);
    }
  }
});
