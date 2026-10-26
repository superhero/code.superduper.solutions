// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const editor=page=>page.getByLabel('Code editor document',{exact:true});
const pane=page=>page.getByRole('region',{name:'Keybindings',exact:true});
async function bindings(page,scope='global'){
  await selectPage(page, 'Settings', 'Controls');await selectDropdown(page,'Settings scope',scope);
}
async function record(page,action,key,index=1){
  await pane(page).getByLabel('Filter keybindings').fill(action);
  const input=pane(page).getByRole('textbox',{name:`${action} shortcut ${index}`,exact:true});
  await input.click();await input.press(key);await saved(page);
}
Then('custom undo shortcuts replace defaults and survive reload',async function(){
  const page=this.page;await bindings(page);await record(page,'Undo','F9');
  await selectPage(page,'Editor');await editor(page).fill('const value = 1;');await saved(page);
  await editor(page).press('Control+z');await expect(editor(page)).toHaveText('const value = 1;');
  await editor(page).press('F9');await saved(page);await expect(editor(page)).toHaveText('');
  await editor(page).press('Control+y');await saved(page);await expect(editor(page)).toHaveText('const value = 1;');
  await page.reload({waitUntil:'networkidle'});await saved(page);
  // Start a separate row edit group before checking the restored Undo shortcut.
  await editor(page).press('Control+End');await editor(page).press('ArrowLeft');
  await editor(page).fill('const value = 2;');await saved(page);
  await editor(page).press('F9');await saved(page);await expect(editor(page)).toHaveText('const value = 1;');
  await bindings(page);const filter=pane(page).getByLabel('Filter keybindings');await filter.fill('ordinary text');
  await filter.press('F9');await expect(filter).toHaveValue('ordinary text');
  await filter.press('Control+z');await expect(filter).not.toHaveValue('ordinary text');
});
Then('custom editor shortcuts reject conflicts and inherit repository choices',async function(){
  const page=this.page;await bindings(page);await record(page,'Find','Control+z');
  await expect(pane(page).getByRole('alert')).toContainText('already assigned to Undo');
  await pane(page).getByRole('textbox',{name:'Find shortcut 1',exact:true}).press('F8');await saved(page);
  await selectPage(page,'Editor');await editor(page).press('F8');await expect(page.locator('.cm-search input[name="search"]')).toBeFocused();
  await page.locator('.cm-search input[name="search"]').press('Escape');
  await bindings(page,'repository');await pane(page).getByLabel('Filter keybindings').fill('Find');
  await expect(pane(page).getByRole('textbox',{name:'Find shortcut 1',exact:true})).toHaveValue('F8');
  await pane(page).getByRole('button',{name:'Remove Find shortcut 1',exact:true}).click();await saved(page);
  await selectPage(page,'Editor');await editor(page).press('F8');await expect(page.locator('.cm-search')).toHaveCount(0);
  await bindings(page,'repository');
  await expect(pane(page).getByRole('button',{name:'Reset keybindings',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Reset keybindings',exact:true})).toHaveCount(0);
  await page.getByRole('region',{name:'Settings toolbar buttons',exact:true}).getByRole('switch',{name:'Reset keybindings',exact:true}).check();await saved(page);
  await page.getByRole('button',{name:'Reset keybindings',exact:true}).click();await saved(page);
  await selectPage(page,'Editor');await editor(page).press('F8');await expect(page.locator('.cm-search input[name="search"]')).toBeFocused();
});
Then('custom tab and comparison shortcuts target the focused split viewport',async function(){
  const page=this.page;await bindings(page);
  await record(page,'Split editor','F6');await record(page,'File diff','F7');await record(page,'Close tab','F8');
  await selectPage(page,'Editor');await editor(page).fill('const shared = 1;');await saved(page);
  await editor(page).press('F6');await saved(page);await expect(page.locator('.editor-document > .split-editor')).toHaveCount(1);
  const split=page.locator('.editor-document > .split-editor');const document=split.getByLabel('Split editor document',{exact:true});
  await document.click();await document.press('F7');await saved(page);
  await expect(split.getByRole('region',{name:'File diff',exact:true})).toBeVisible();
  await expect(page.locator('.primary-pane').getByRole('region',{name:'File diff',exact:true})).toHaveCount(0);
  await split.getByLabel('Current file',{exact:true}).press('F8');await saved(page);
  await expect(split.getByRole('region',{name:'File diff',exact:true})).toHaveCount(0);
  await expect(document).toHaveText('const shared = 1;');
});

Then('completion acceptance can share Tab with indentation and Save can run an editor command',async function(){
  const page=this.page;await bindings(page);
  await record(page,'Accept completion','Tab');await record(page,'Find','Control+s');
  await selectPage(page,'Editor');await editor(page).fill('con');await saved(page);
  await editor(page).press('Control+End');await editor(page).press('Control+Space');
  const completion=page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:/^const$/});
  await expect(completion).toBeVisible();
  await editor(page).press('Tab');await saved(page);await expect(editor(page)).toContainText('const');
  await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0);
  await editor(page).press('Control+s');await expect(page.locator('.cm-search input[name="search"]')).toBeFocused();
});
Then('the configured formatter shortcut formats the focused split editor',async function(){
  const page=this.page;await bindings(page);
  await record(page,'Split editor','F6');await record(page,'Format file','F5');
  await selectPage(page,'Editor');await editor(page).fill('const value={answer:42};');await saved(page);
  await editor(page).press('F6');await saved(page);
  const split=page.locator('.editor-document > .split-editor').getByLabel('Split editor document',{exact:true});
  await split.click();await split.press('F5');
  await expect(split).toContainText('const value = { answer: 42 };');await saved(page);
  await split.press('Control+z');await saved(page);
  await expect(split).toContainText('const value={answer:42};');
});

Then('shortcut rows keep Add in their headers across Settings widths',{timeout:90000},async function(){
  const page=this.page;await page.setViewportSize({width:2000,height:1000});await bindings(page);
  const settings=page.locator('[data-settings-panel]'),divider=page.getByRole('separator',{name:'Resize Settings pane',exact:true});
  await expect(divider).toHaveAttribute('aria-disabled','false');
  await mkdir(this.artifactDirectory,{recursive:true});const samples=[];
  for(const width of [920,820,780,760,744,728,704,680,656,650,640,480,320]){
    const current=(await settings.boundingBox()).width,handle=await divider.boundingBox();
    const x=handle.x+handle.width/2,y=handle.y+100;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+current-width,y,{steps:3});await page.mouse.up();await saved(page);
    await expect.poll(async()=>Math.round((await settings.boundingBox()).width)).toBe(width);
    const sample=await pane(page).evaluate(root=>{
      const bad=[];let wrapped=false,inline=false;
      for(const row of root.querySelectorAll('.binding-row')){
        const controls=row.querySelector('.shortcuts'),header=row.querySelector('.binding-header'),label=row.querySelector('.action-label'),inputs=[...row.querySelectorAll('.shortcut input')];
        const first=inputs[0].getBoundingClientRect(),box=controls.getBoundingClientRect(),headerBox=header.getBoundingClientRect(),rowBox=row.getBoundingClientRect(),add=header.querySelector('button[aria-label^="Add "]');
        if(add){const rect=add.getBoundingClientRect(),labelBox=label.getBoundingClientRect();if(Math.abs(rect.top+rect.height/2-headerBox.top-headerBox.height/2)>1||Math.abs(rect.right-headerBox.right)>1||labelBox.right>rect.left+1)bad.push({action:label.textContent,problem:'Add outside or overlapping action header'});}
        if(Math.abs(box.top-headerBox.bottom)>1||Math.abs(box.left-rowBox.left)>1||Math.abs(box.right-rowBox.right)>1)bad.push({action:label.textContent,problem:'Bindings do not fill the row below the header'});
        for(const input of inputs){const rect=input.getBoundingClientRect(),remove=input.parentElement.querySelector('button');
          if(rect.left<box.left-1||rect.right>box.right+1)bad.push({action:label.textContent,problem:'Input outside shortcut column'});
          if(remove){const button=remove.getBoundingClientRect();if(rect.right>button.left+1||Math.abs(rect.top-button.top)>1||button.right>box.right+1)bad.push({action:label.textContent,problem:'Remove overlaps or separates from shortcut'});}}
        if(inputs.length>1){const second=inputs[1].getBoundingClientRect();wrapped ||= second.top>first.top+1;inline ||= Math.abs(second.top-first.top)<1;}
      }
      return {width:root.getBoundingClientRect().width,bad,wrapped,inline};
    });
    samples.push(sample);expect(sample.bad,`Shortcut layout at Settings width ${width}`).toEqual([]);
    if(width===920||width===320)await pane(page).locator('.binding-row').filter({has:page.getByLabel('Redo shortcut 1',{exact:true})}).screenshot({path:`${this.artifactDirectory}/redo-${width}.png`});
  }
  expect(samples.some(sample=>sample.wrapped)).toBe(true);expect(samples.some(sample=>sample.inline)).toBe(true);
  await writeFile(`${this.artifactDirectory}/shortcut-layout.json`,JSON.stringify(samples,null,2));
  await pane(page).getByRole('button',{name:'Add Redo shortcut',exact:true}).click();
  const added=pane(page).getByLabel('Redo shortcut 3',{exact:true});await expect(added).toBeFocused();await added.press('F9');await saved(page);
  await expect(added).toHaveValue('F9');await pane(page).getByRole('button',{name:'Remove Redo shortcut 3',exact:true}).click();await saved(page);
  await expect(added).toHaveCount(0);
});
