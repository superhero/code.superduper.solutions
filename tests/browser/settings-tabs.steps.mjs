// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {selectPage,selectDropdown,selectSettingsTab} from './navigation.helpers.mjs';
import {fakeAI,openComposer} from '../speech/browser-harness.mjs';
import {BROWSER_PROFILES} from '../../src/lib/assistant/browser/catalog.ts';
import {SETTINGS_TABS} from '../../src/lib/editor/settings-tabs.ts';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const tablist=page=>page.getByRole('tablist',{name:'Settings sections',exact:true});
Then('Settings section headings share text icon and spacing dimensions across all tabs',{timeout:60000},async function(){
  const page=this.page,checked=[];
  const unit=await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).fontSize));
  for(const tab of SETTINGS_TABS){
    await selectPage(page,'Settings',tab.label);
    const panel=page.getByRole('tabpanel',{name:tab.label,exact:true});
    const headings=await panel.getByRole('heading').all();
    if(tab.id==='licenses')headings.push(panel.locator('.license-notices > details > summary'));
    let count=0;
    for(const heading of headings){
      const sizes=await heading.evaluate(node=>{
        let row=node,icon;
        while(row&&!row.hasAttribute('data-settings-section')){
          icon=row.querySelector(':scope > .material-symbols-rounded');if(icon)break;row=row.parentElement;
        }
        if(!icon)return null;
        const text=getComputedStyle(node),symbol=getComputedStyle(icon),layout=getComputedStyle(row);
        return {name:node.textContent.trim(),font:parseFloat(text.fontSize),weight:text.fontWeight,icon:parseFloat(symbol.fontSize),width:parseFloat(symbol.width),height:parseFloat(symbol.height),gap:parseFloat(layout.columnGap)};
      });
      if(!sizes)continue;
      expect(sizes.font,`${tab.label}: ${sizes.name}`).toBeCloseTo(unit*.875,3);
      expect(sizes.weight).toBe('650');expect(sizes.icon).toBeCloseTo(unit*1.25,3);
      expect(sizes.width).toBeCloseTo(unit*1.25,3);expect(sizes.height).toBeCloseTo(unit*1.25,3);expect(sizes.gap).toBeCloseTo(unit*.5,3);
      checked.push(sizes.name);count++;
    }
    expect(count,tab.label).toBeGreaterThan(0);
    if(tab.id==='ai'){
      await panel.getByRole('heading',{name:'System instructions',exact:true}).scrollIntoViewIfNeeded();
      await mkdir(this.artifactDirectory,{recursive:true});await page.locator('[data-settings-panel]').screenshot({path:`${this.artifactDirectory}/settings-heading-scale.png`});
    }
  }
  for(const title of ['Inference engines','LLM','Speech input','System instructions','Skills','Tools'])expect(checked.some(name=>name.endsWith(title))).toBe(true);
});
Then('AI setup opens in Settings and preserves connection choices and chat drafts',{timeout:60000},async function(){
  const page=this.page;await page.setViewportSize({width:1800,height:1000});await fakeAI(page);
  await page.getByRole('button',{name:'AI chat',exact:true}).click();await openComposer(page);
  const draft=page.getByRole('textbox',{name:'Message AI',exact:true});await draft.fill('Keep my conversation draft.');
  await selectPage(page,'Settings','AI');
  const settings=page.getByRole('tabpanel',{name:'AI',exact:true}),chat=page.locator('[data-ollama-panel]');
  await expect(settings).toBeVisible();await expect(tablist(page).getByRole('tab',{name:'AI',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(tablist(page).getByRole('tab',{name:'AI',exact:true})).toBeInViewport();
  for(const name of ['AI connections',...BROWSER_PROFILES.map(profile=>profile.title),'Speech input settings']){
    await expect(settings.getByRole('region',{name,exact:true})).toBeVisible();await expect(chat.getByRole('region',{name,exact:true})).toHaveCount(0);
  }
  await expect(draft).toHaveText('Keep my conversation draft.');
  await settings.getByRole('button',{name:'Edit Local Ollama',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Remote inference connection',exact:true});
  await expect(editor.getByRole('textbox',{name:'Connection name',exact:true})).toHaveValue('Local Ollama');
  await editor.getByRole('textbox',{name:'Connection name',exact:true}).fill('Updated runtime');
  await editor.getByRole('button',{name:'Save connection',exact:true}).click();
  await expect(settings.getByRole('button',{name:'Use Updated runtime',exact:true})).toBeVisible();
  await settings.getByRole('button',{name:'Use Updated runtime',exact:true}).click();
  await expect(page.locator('[data-settings-panel]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'AI connection',exact:true})).toContainText('Updated runtime');
  await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(draft).toHaveText('Keep my conversation draft.');
  await selectPage(page,'Settings','AI');await page.getByRole('button',{name:'Configure ONNX Runtime Web speech inference',exact:true}).click();
  const speech=settings.getByRole('region',{name:'Speech input settings',exact:true});await expect(speech).toBeInViewport();
  await expect(chat.getByRole('region',{name:'Speech input settings',exact:true})).toHaveCount(0);
  await page.setViewportSize({width:820,height:900});await expect(speech).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await mkdir(this.artifactDirectory,{recursive:true});await page.locator('[data-settings-panel]').screenshot({path:`${this.artifactDirectory}/ai-setup-in-settings.png`});
  await selectPage(page,'Editor');
  const toggle=page.getByRole('button',{name:'AI chat',exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
  await expect(draft).toHaveText('Keep my conversation draft.');
  expect(this.requests.filter(request=>/huggingface\.co|raw\.githubusercontent\.com|api\.openai\.com/.test(request.url))).toHaveLength(0);
});
Then('connection actions open accessible dialogs and only Save changes profiles',{timeout:60000},async function(){
  const page=this.page;await selectPage(page,'Settings','AI');
  const settings=page.getByRole('tabpanel',{name:'AI',exact:true}),add=settings.getByRole('button',{name:'New connection',exact:true});
  const name=page.getByRole('textbox',{name:'Connection name',exact:true});
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(name).toHaveCount(0);
  await add.click();const dialog=page.getByRole('dialog',{name:'Remote inference connection',exact:true});
  const provider=dialog.getByRole('button',{name:'Connection provider',exact:true});
  await expect(dialog).toBeVisible();await expect(provider).toBeFocused();
  expect((await provider.boundingBox()).y).toBeLessThan((await name.boundingBox()).y);
  await name.fill('   ');await dialog.getByRole('button',{name:'Save connection',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Enter a valid connection name and provider.');
  await name.fill('Discarded draft');await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(add).toBeFocused();
  await expect(settings.getByRole('button',{name:'Use Discarded draft',exact:true})).toHaveCount(0);
  await add.click();await expect(name).toHaveValue('');await expect(dialog.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'Close',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(provider).toBeFocused();await page.keyboard.press('Tab');await expect(name).toBeFocused();
  await name.fill('Saved runtime');await dialog.getByRole('button',{name:'Save connection',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(settings.getByRole('button',{name:'Use Saved runtime',exact:true})).toBeVisible();
  const edit=settings.getByRole('button',{name:'Edit Saved runtime',exact:true});await edit.click();
  const editing=page.getByRole('dialog',{name:'Remote inference connection',exact:true});await expect(name).toHaveValue('Saved runtime');
  await name.fill('Cancelled edit');await editing.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(edit).toBeFocused();await expect(settings.getByRole('button',{name:'Use Saved runtime',exact:true})).toBeVisible();
  await edit.click();await expect(name).toHaveValue('Saved runtime');await name.fill('Renamed runtime');
  await page.setViewportSize({width:400,height:700});
  const bounds=await editing.boundingBox();expect(bounds.width).toBeLessThanOrEqual(368);expect(bounds.height).toBeLessThanOrEqual(668);
  await mkdir(this.artifactDirectory,{recursive:true});await editing.screenshot({path:`${this.artifactDirectory}/connection-dialog.png`});
  await editing.getByRole('button',{name:'Save connection',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(settings.getByRole('button',{name:'Use Renamed runtime',exact:true})).toBeVisible();
  await expect(name).toHaveCount(0);
});
Then('System instructions highlight Markdown grow with content and preserve scoped settings',{timeout:60000},async function(){
  const page=this.page;await selectPage(page,'Settings','AI');
  const input=page.getByRole('textbox',{name:'System instructions',exact:true}),source=()=>input.locator('.cm-line').allTextContents().then(lines=>lines.join('\n'));
  const markdown='# Rules\n\nUse **bold**, *emphasis*, and `code`.\n\nFinal line.';
  await input.fill(markdown);await saved(page);await expect.poll(source).toBe(markdown);
  for(const selector of ['.ai-md-heading','.ai-md-strong','.ai-md-emphasis','.ai-md-code'])await expect(input.locator(selector).first()).toBeVisible();
  await input.press('Control+End');await input.press('Enter');await input.pressSequentially('Next rule.');await saved(page);
  const edited=await source();expect(edited).toBe(markdown+'\nNext rule.');
  await input.press('Control+z');await expect.poll(source).not.toBe(edited);await input.press('Control+y');await expect.poll(source).toBe(edited);
  await expect(page.getByLabel('Code editor document',{exact:true})).toHaveText('');
  const scroller=page.locator('.ai-instructions .cm-scroller'),initial=(await scroller.boundingBox()).height;
  await input.fill(markdown+'\nMore instructions.'.repeat(80));await saved(page);
  await expect.poll(async()=>(await scroller.boundingBox()).height).toBeGreaterThan(initial);
  const overflow=await scroller.evaluate(node=>node.scrollHeight-node.clientHeight);expect(overflow).toBeLessThanOrEqual(1);
  await input.fill(markdown);await saved(page);
  await selectDropdown(page,'Settings scope','repository');await input.fill('# Repository\n\n**Local rules**');await saved(page);
  await selectDropdown(page,'Settings scope','global');await expect.poll(source).toBe(markdown);
  await page.reload({waitUntil:'networkidle'});await saved(page);await expect.poll(source).toBe(markdown);
  await selectDropdown(page,'Settings scope','repository');await expect.poll(source).toBe('# Repository\n\n**Local rules**');
  await input.fill('x'.repeat(16001));await expect.poll(source).toBe('# Repository\n\n**Local rules**');
  await mkdir(this.artifactDirectory,{recursive:true});await page.locator('.ai-instructions').screenshot({path:`${this.artifactDirectory}/markdown-instructions.png`});
});
Then('wheel scrolling over System instructions moves Settings and chat drafts keep their own scrolling',{timeout:60000},async function(){
  const page=this.page;await page.setViewportSize({width:1400,height:800});await selectPage(page,'Settings','AI');
  const input=page.getByRole('textbox',{name:'System instructions',exact:true}),scroller=page.locator('.ai-instructions .cm-scroller'),pane=page.locator('#panel-settings');
  for(const content of ['# Rules\n\nKeep instructions concise.','# Rules\n\n'+('A longer instruction that wraps with the available pane width.\n').repeat(80)]){
    await input.fill(content);await saved(page);
    await expect.poll(()=>scroller.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeLessThanOrEqual(1);
    for(const delta of [100,-100]){
      await scroller.scrollIntoViewIfNeeded();
      const field=await scroller.boundingBox(),bounds=await pane.boundingBox(),x=field.x+30,y=(Math.max(field.y,bounds.y)+Math.min(field.y+field.height,bounds.y+bounds.height))/2;
      await page.mouse.move(x,y);
      expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.ai-instructions'),{x,y})).toBe(true);
      const before=await pane.evaluate(node=>node.scrollTop);await page.mouse.wheel(0,delta);
      if(delta>0)await expect.poll(()=>pane.evaluate(node=>node.scrollTop)).toBeGreaterThan(before);
      else await expect.poll(()=>pane.evaluate(node=>node.scrollTop)).toBeLessThan(before);
      expect(await scroller.evaluate(node=>node.scrollTop)).toBe(0);
    }
  }
  await selectPage(page,'Editor');await fakeAI(page);await openComposer(page);
  const chat=page.getByRole('textbox',{name:'Message AI',exact:true}),chatScroll=page.locator('[data-ai-composer] .cm-scroller');
  await chat.fill('A long chat draft.\n'.repeat(50));
  await expect.poll(()=>chatScroll.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeGreaterThan(0);
  await chatScroll.evaluate(node=>node.scrollTop=0);await chatScroll.hover();await page.mouse.wheel(0,120);
  await expect.poll(()=>chatScroll.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
});
Then('Editor switches retain title labels and expose descriptions as tooltips',async function(){
  const page=this.page;await page.setViewportSize({width:1600,height:900});await selectPage(page,'Settings','Editor');
  const editor=page.getByRole('tabpanel',{name:'Editor',exact:true}),control=editor.getByRole('switch',{name:'Autocompletion',exact:true});
  const description='Offer language and document completions as you type.';
  const tooltip=page.getByRole('tooltip').filter({hasText:description});
  await expect(editor.getByText(description,{exact:true})).toHaveCount(0);
  await expect(control).toHaveAccessibleName('Autocompletion');await expect(control).toBeChecked();
  await editor.getByText('Autocompletion',{exact:true}).hover();
  await expect(tooltip).toHaveText(description);await expect(control).toHaveAccessibleDescription(description);
  await editor.getByText('Autocompletion',{exact:true}).click();await saved(page);await expect(control).not.toBeChecked();
  await page.mouse.move(100,300);await expect(tooltip).toBeHidden();
  await editor.getByRole('slider',{name:'Scroll speed',exact:true}).focus();await page.keyboard.press('Tab');
  await expect(control).toBeFocused();await expect(tooltip).toHaveText(description);
  await page.keyboard.press('Escape');await expect(tooltip).toBeHidden();await expect(control).toBeFocused();
  await page.keyboard.press('Space');await saved(page);await expect(control).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(editor.getByRole('switch',{name:'Automatic indentation',exact:true})).toBeFocused();
  await expect(page.getByRole('tooltip').filter({hasText:'Reindent language constructs while typing.'})).toBeVisible();
  await mkdir(this.artifactDirectory,{recursive:true});
  await page.locator('[data-settings-panel]').screenshot({path:`${this.artifactDirectory}/editor-switch-tooltips.png`});
});
Then('Editor option groups and slider tracks stay aligned while resizing Settings',{timeout:90000},async function(){
  const page=this.page;await page.setViewportSize({width:1800,height:900});await selectPage(page,'Settings','Editor');
  const settings=page.locator('[data-settings-panel]'),divider=page.getByRole('separator',{name:'Resize Settings pane',exact:true});
  const editor=page.getByRole('tabpanel',{name:'Editor',exact:true});
  await mkdir(this.artifactDirectory,{recursive:true});
  for(const width of [900,600,580,540,480,320]){
    const current=(await settings.boundingBox()).width,handle=await divider.boundingBox(),x=handle.x+handle.width/2,y=handle.y+100;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+current-width,y,{steps:3});await page.mouse.up();await saved(page);
    await expect.poll(async()=>Math.round((await settings.boundingBox()).width)).toBe(width);
    for(const tab of ['Editor','Appearance']){
      await selectSettingsTab(page,tab);
      const sample=await page.getByRole('tabpanel',{name:tab,exact:true}).evaluate(root=>{
        const bad=[];
        for(const pair of root.querySelectorAll('.slider-fields')){
          const fields=[...pair.querySelectorAll('input[type="range"]')],rects=fields.map(field=>field.getBoundingClientRect()),bounds=pair.getBoundingClientRect();
          const beside=rects[0].right<=rects[1].left+1;
          if(beside&&Math.abs(rects[0].top-rects[1].top)>1)bad.push('Slider tracks differ in height');
          if(!beside&&rects[0].bottom>rects[1].top+1)bad.push('Stacked sliders overlap');
          if(rects.some(rect=>rect.left<bounds.left-1||rect.right>bounds.right+1))bad.push('Slider exceeds its column');
          for(const output of pair.querySelectorAll('output'))if(output.getBoundingClientRect().height>parseFloat(getComputedStyle(output).fontSize)*1.5)bad.push('Value and unit wrap onto separate lines');
        }
        return {bad};
      });
      expect(sample.bad,`${tab} sliders at ${width}px`).toEqual([]);
    }
    await selectSettingsTab(page,'Editor');
    const columns=await editor.getByRole('group',{name:'Editor editing options',exact:true}).evaluate(group=>{
      const rows=[...group.querySelectorAll('.toggle-field')].map(node=>node.getBoundingClientRect());
      return rows.filter(row=>Math.abs(row.top-rows[0].top)<1).length;
    });
    if(width>=600)expect(columns).toBeGreaterThan(1);if(width===320)expect(columns).toBe(1);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if([900,580,320].includes(width))await settings.screenshot({path:`${this.artifactDirectory}/editor-options-${width}.png`});
  }
});
Then('Settings tabs support vertical and horizontal wheels and preserve zoom gestures',async function(){
  const page=this.page;await page.setViewportSize({width:1200,height:900});await selectPage(page,'Settings');
  const rail=page.getByRole('navigation',{name:'Settings view',exact:true}),body=page.locator('#panel-settings');
  const position=()=>rail.evaluate(node=>node.scrollLeft);
  await expect.poll(()=>rail.evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(true);
  await rail.evaluate(node=>node.scrollLeft=0);await rail.hover();
  await page.mouse.wheel(0,160);await expect.poll(position).toBeGreaterThan(0);
  await page.mouse.wheel(0,-160);await expect.poll(position).toBe(0);
  await page.mouse.wheel(120,0);await expect.poll(position).toBeGreaterThan(0);
  for(const modifier of ['ctrlKey','metaKey']){
    const result=await rail.evaluate((node,modifier)=>{
      const before=node.scrollLeft,event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:100,[modifier]:true});
      node.dispatchEvent(event);return {prevented:event.defaultPrevented,before,after:node.scrollLeft};
    },modifier);
    expect(result.prevented).toBe(false);expect(result.after).toBe(result.before);
  }
  for(const deltaMode of [1,2]){
    const result=await rail.evaluate((node,deltaMode)=>{
      node.scrollLeft=0;
      const unit=deltaMode===1?parseFloat(getComputedStyle(node).fontSize)*1.5:node.clientWidth;
      const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:1,deltaMode});
      node.dispatchEvent(event);
      return {prevented:event.defaultPrevented,position:node.scrollLeft,expected:Math.min(unit,node.scrollWidth-node.clientWidth)};
    },deltaMode);
    expect(result.prevented).toBe(true);expect(Math.abs(result.position-result.expected)).toBeLessThanOrEqual(1);
  }
  await expect(tablist(page).getByRole('tab',{name:'Appearance',exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(0);
});
Then('Settings groups related sections and retains scope drafts and keyboard access',{timeout:90000},async function(){
  const page=this.page;await page.setViewportSize({width:1800,height:900});await selectPage(page,'Settings');
  await selectDropdown(page,'Settings scope','repository');
  const groups=[['Appearance',['User interface','Editor typography','Editor colors']],['Editor',['Indentation','Editor details']],
    ['Languages',['Language mappings','Syntax highlighting','Language engines']],['Formatting',['Formatters']],
    ['Controls',['Editor toolbar','Settings toolbar','Keybindings']],['AI',['System instructions','Skills','Tools','Message controls']],['Git',['Staging history','Remote connections']],['Licenses',[]]];
  await expect(tablist(page).getByRole('tab')).toHaveCount(groups.length);
  for(let i=0;i<groups.length;i++)await expect(tablist(page).getByRole('tab').nth(i)).toHaveAccessibleName(groups[i][0]);
  for(const [name,headings] of groups){
    await selectSettingsTab(page,name);await expect(page.getByRole('tabpanel')).toHaveCount(1);
    const panel=page.getByRole('tabpanel',{name,exact:true});
    for(const heading of headings)await expect(panel.getByRole('heading',{name:heading,exact:true})).toBeVisible();
    if(name==='AI'){
      for(const [group,count] of [['AI Git tools',5],['AI Repository tools',4],['AI message controls',2]]){
        await expect(panel.getByRole('group',{name:group,exact:true}).getByRole('switch')).toHaveCount(count);
      }
      const description='Find literal text in repository files.';
      await expect(panel.getByText(description,{exact:true})).toHaveCount(0);
      await panel.getByText('Search text',{exact:true}).hover();
      await expect(page.getByRole('tooltip').filter({hasText:description})).toBeVisible();
      await page.mouse.move(1,1);
      await mkdir(this.artifactDirectory,{recursive:true});
      await page.locator('[data-settings-panel]').screenshot({path:`${this.artifactDirectory}/ai-switch-groups.png`});
    }
    if(name==='Editor')await expect(panel.getByRole('slider',{name:'Changes retained per file',exact:true})).toHaveCount(0);
    if(name==='Git'){
      await expect(panel.getByRole('slider',{name:'Changes retained per file',exact:true})).toBeVisible();
      const history=panel.getByRole('heading',{name:'Staging history',exact:true}),connections=panel.getByRole('heading',{name:'Remote connections',exact:true});
      await expect.poll(async()=>Math.abs((await history.boundingBox()).x-(await connections.boundingBox()).x)).toBeLessThan(1);
      await mkdir(this.artifactDirectory,{recursive:true});
      await page.locator('[data-settings-panel]').screenshot({path:`${this.artifactDirectory}/git-history-settings.png`});
    }
    await expect(page.getByRole('button',{name:'Settings scope',exact:true})).toHaveAttribute('data-value','repository');
  }
  await selectSettingsTab(page,'Git');
  const integration=page.getByRole('region',{name:'GitHub integration',exact:true});
  await integration.getByRole('button',{name:'Install',exact:true}).click();await expect(integration.getByRole('button',{name:'Add connection',exact:true})).toBeEnabled();
  await integration.getByRole('button',{name:'Add connection',exact:true}).click();
  await page.getByRole('textbox',{name:'Name',exact:true}).fill('Draft origin');
  await selectSettingsTab(page,'Editor');await page.getByRole('switch',{name:'Line wrapping',exact:true}).check();await saved(page);
  await selectSettingsTab(page,'Git');await expect(page.getByRole('textbox',{name:'Name',exact:true})).toHaveValue('Draft origin');
  await selectSettingsTab(page,'Appearance');
  await tablist(page).getByRole('tab',{name:'Appearance',exact:true}).focus();await page.keyboard.press('End');
  await expect(tablist(page).getByRole('tab',{name:'Licenses',exact:true})).toBeFocused();
  await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  await expect(tablist(page).getByRole('tab',{name:'Editor',exact:true})).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Indentation',exact:true})).toBeFocused();
  for(const width of [600,360]){
    await page.setViewportSize({width,height:900});await selectSettingsTab(page,'Licenses');await selectSettingsTab(page,'Appearance');
    await expect(tablist(page).locator('[tabindex="0"]')).toHaveCount(1);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await expect(page.getByRole('region',{name:'Editor',exact:true})).toBeVisible();
  }
  await mkdir(this.artifactDirectory,{recursive:true});await page.screenshot({path:`${this.artifactDirectory}/settings-tabs-narrow.png`});
});
Then('Settings remembers its selected tab and each tab scroll position',async function(){
  const page=this.page;await page.setViewportSize({width:1800,height:500});await selectPage(page,'Settings');
  const body=page.locator('#panel-settings');
  await body.evaluate(node=>node.scrollTop=300);await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(300);
  await selectSettingsTab(page,'Editor');await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(0);
  await body.evaluate(node=>node.scrollTop=180);await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(180);
  await selectSettingsTab(page,'Appearance');await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(300);
  await selectSettingsTab(page,'Editor');await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(180);await saved(page);
  await page.reload();await saved(page);await expect(tablist(page).getByRole('tab',{name:'Editor',exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(180);
  await page.getByRole('button',{name:'Close Settings',exact:true}).click();await expect(body).toHaveCount(0);
  await page.getByRole('button',{name:'Settings',exact:true}).click();await saved(page);
  await expect(tablist(page).getByRole('tab',{name:'Editor',exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(180);
  await selectSettingsTab(page,'Appearance');await expect.poll(()=>body.evaluate(node=>node.scrollTop)).toBe(300);
});
