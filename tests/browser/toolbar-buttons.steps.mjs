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
async function scope(page,value){await selectPage(page, 'Settings', 'Controls');await selectDropdown(page,'Settings scope',value);}
async function invoke(page,name){if(name==='Undo'||name==='Redo')name+=' settings';await page.getByRole('button',{name,exact:true}).click();await saved(page);}
async function toggle(page,name){await choice(page,name).click();await saved(page);}
Then('the AI connection settings shortcut defaults off and follows its Controls preference',async function(){
  const page=this.page,chat=page.getByRole('button',{name:'AI chat',exact:true}),shortcut=page.getByRole('button',{name:'AI connections',exact:true});
  async function openChat(){await selectPage(page,'Editor');if(await chat.getAttribute('aria-expanded')!=='true')await chat.click();}
  await openChat();await expect(shortcut).toHaveCount(0);
  await scope(page,'global');
  const setting=panel(page).getByRole('region',{name:'AI toolbar buttons',exact:true}).getByRole('switch',{name:'Connection settings',exact:true});
  await expect(setting).not.toBeChecked();await setting.check();await saved(page);
  await openChat();await expect(shortcut).toBeVisible();await shortcut.click();
  await expect(page.getByRole('tabpanel',{name:'AI',exact:true})).toBeVisible();
  await page.reload();await saved(page);await scope(page,'global');await expect(setting).toBeChecked();
  await openChat();await expect(shortcut).toBeVisible();
  await scope(page,'global');await setting.uncheck();await saved(page);
  await openChat();await expect(shortcut).toHaveCount(0);
});
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
  for(const name of ['Undo settings','Redo settings','Reset global defaults'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
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
  await page.getByRole('button',{name:'Settings scope',exact:true}).click();
  const menu=page.getByRole('menu',{name:'Settings scope',exact:true});
  await expect(menu.getByRole('menuitemradio')).toHaveCount(2);
  await expect(menu.getByRole('menuitemradio',{name:'File settings',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

Then('Settings independently controls its toolbar buttons',async function(){
  const page=this.page;await scope(page,'global');
  const group=name=>panel(page).getByRole('region',{name:`${name} toolbar buttons`,exact:true});
  await expect(group('Settings').getByRole('switch',{name:'Reset settings',exact:true})).not.toBeChecked();
  for(const name of ['Undo','Redo']){
    await group('Settings').getByRole('switch',{name,exact:true}).click();await saved(page);
  }
  for(const name of ['Undo settings','Redo settings','Reset global defaults'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(group('History')).toHaveCount(0);
  for(const name of ['Undo','Redo'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await selectPage(page,'Editor');
  for(const name of ['Undo','Redo'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  await scope(page,'global');await page.reload();await saved(page);
  for(const name of ['Undo settings','Redo settings','Reset global defaults'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  await group('Settings').getByRole('switch',{name:'Undo',exact:true}).click();await saved(page);
  await expect(page.getByRole('button',{name:'Undo settings',exact:true})).toBeVisible();
});

Then('History remains available without a separate staged toolbar shortcut',async function(){
  const page=this.page;
  await page.getByRole('button',{name:'Open History',exact:true}).click();await saved(page);
  const views=page.getByRole('navigation',{name:'History views',exact:true});
  await expect(views.getByRole('button',{name:'Committed',exact:true})).toHaveAttribute('aria-pressed','true');
  await views.getByRole('button',{name:'Staged',exact:true}).click();await saved(page);
  await expect(views.getByRole('button',{name:'Staged',exact:true})).toHaveAttribute('aria-pressed','true');
  await scope(page,'global');
  for(const name of ['Commit history','Git operations','Staged history'])await expect(choice(page,name)).toHaveCount(0);
  await selectPage(page,'Editor');await page.reload();await saved(page);
  const toolbar=page.locator('.editor-toolbar');
  for(const name of ['Open History','Git operations'])await expect(toolbar.getByRole('button',{name,exact:true})).toBeVisible();
  await expect(toolbar.getByRole('button',{name:'Open staged history',exact:true})).toHaveCount(0);
});
