// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {mkdir} from 'node:fs/promises';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const labels=['Undo','Redo','Zoom out','Zoom in','Format file','File diff'];
const buttonLabels=['Undo','Redo','Zoom out','Zoom in','Format file','Open file diff'];
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const panel=page=>page.getByRole('region',{name:'Toolbar',exact:true});
const choice=(page,name)=>panel(page).getByRole('region',{name:'Editor toolbar buttons',exact:true}).getByRole('switch',{name,exact:true});
async function scope(page,value){await selectPage(page,'Settings');await selectDropdown(page,'Settings scope',value);}
async function invoke(page,name){await page.getByRole('button',{name,exact:true}).click();await saved(page);}
async function toggle(page,name){await choice(page,name).click();await saved(page);}
Then('toolbar visibility persists with working shortcuts and Settings undo redo',async function(){
  const page=this.page;await scope(page,'global');
  await panel(page).getByRole('region',{name:'Settings toolbar buttons',exact:true}).getByRole('switch',{name:'Reset settings',exact:true}).check();await saved(page);
  for(const name of labels){await expect(choice(page,name)).toBeChecked();await toggle(page,name);}
  await selectPage(page,'Editor');
  for(const name of buttonLabels)await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(page.getByRole('group',{name:'Editor zoom',exact:true})).toHaveCount(0);
  await page.getByLabel('Code editor document',{exact:true}).focus();await page.keyboard.press('Control+z');await saved(page);
  await expect(page.getByLabel('Code editor document',{exact:true})).toHaveText('');
  await scope(page,'global');await invoke(page,'Undo');await expect(choice(page,'File diff')).toBeChecked();
  await invoke(page,'Redo');await expect(choice(page,'File diff')).not.toBeChecked();
  await page.reload();await saved(page);
  for(const name of labels)await expect(choice(page,name)).not.toBeChecked();
  for(const name of ['Undo','Redo','Reset global defaults'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await mkdir(this.artifactDirectory,{recursive:true});
  await this.attach(await panel(page).screenshot({path:`${this.artifactDirectory}/toolbar-buttons-wide.png`}),'image/png');
  await page.setViewportSize({width:390,height:900});
  const bounds=await panel(page).boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
  await this.attach(await panel(page).screenshot({path:`${this.artifactDirectory}/toolbar-buttons-narrow.png`}),'image/png');
  await invoke(page,'Reset global defaults');
  for(const name of labels)await expect(choice(page,name)).toBeChecked();
  await selectPage(page,'Editor');for(const name of buttonLabels)await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
});
Then('repository toolbar choices inherit defaults and support reset',async function(){
  const page=this.page;await scope(page,'global');await panel(page).getByRole('region',{name:'Settings toolbar buttons',exact:true}).getByRole('switch',{name:'Reset settings',exact:true}).check();await saved(page);await toggle(page,'Format file');await toggle(page,'Zoom in');
  await scope(page,'repository');await expect(choice(page,'Format file')).not.toBeChecked();await expect(choice(page,'Zoom in')).not.toBeChecked();
  await toggle(page,'Format file');await toggle(page,'Undo');
  await selectPage(page,'Editor');await expect(page.getByRole('button',{name:'Format file',exact:true})).toBeVisible();
  for(const name of ['Undo','Zoom in'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await page.reload();await saved(page);await expect(page.getByRole('button',{name:'Format file',exact:true})).toBeVisible();
  await scope(page,'repository');await invoke(page,'Reset repository overrides');
  await expect(choice(page,'Format file')).not.toBeChecked();await expect(choice(page,'Undo')).toBeChecked();
  await invoke(page,'Undo');await expect(choice(page,'Format file')).toBeChecked();await expect(choice(page,'Undo')).not.toBeChecked();
  await scope(page,'file');await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

Then('each view independently controls its toolbar buttons',async function(){
  const page=this.page;await scope(page,'global');
  const group=name=>panel(page).getByRole('region',{name:`${name} toolbar buttons`,exact:true});
  await expect(group('Settings').getByRole('switch',{name:'Reset settings',exact:true})).not.toBeChecked();
  for(const name of ['Undo','Redo']){
    await group('Settings').getByRole('switch',{name,exact:true}).click();await saved(page);
  }
  for(const name of ['Undo','Redo','Reset global defaults'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  for(const name of ['Undo','Redo']){
    await group('History').getByRole('switch',{name,exact:true}).click();await saved(page);
  }
  await selectPage(page,'History');
  for(const name of ['Undo history','Redo history'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await selectPage(page,'Editor');
  for(const name of ['Undo','Redo'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await scope(page,'global');await page.reload();await saved(page);
  for(const name of ['Undo','Redo','Reset global defaults'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await group('Settings').getByRole('switch',{name:'Undo',exact:true}).click();await saved(page);
  await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeVisible();
});

Then('editor history buttons open their graphs and respect toolbar choices',async function(){
  const page=this.page;
  for(const [label,title] of [['Open commit history','Commit history'],['Open staged history','Staged changes']]){
    await selectPage(page,'Editor');
    await page.getByRole('button',{name:label,exact:true}).click();
    await saved(page);
    await expect(page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:title,exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await scope(page,'global');
  for(const name of ['Commit history','Staged history'])await toggle(page,name);
  await selectPage(page,'Editor');await page.reload();await saved(page);
  for(const name of ['Open commit history','Open staged history'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
});
