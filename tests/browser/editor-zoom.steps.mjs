// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const input=page=>page.getByLabel('Code editor document',{exact:true});
const font=async(page,size)=>{await expect(input(page).locator('..')).toHaveCSS('font-size',`${size}px`);await saved(page);};
async function wheel(page,delta,shift=true){
  await page.locator('.editor-document .cm-scroller').hover();
  if(shift)await page.keyboard.down('Shift');
  await page.mouse.wheel(0,delta);
  if(shift)await page.keyboard.up('Shift');
}
Then('zoom buttons and Shift wheel change editor font size and persist it',async function(){
  await font(this.page,13);
  await this.page.getByRole('button',{name:'Zoom in',exact:true}).click();await font(this.page,14);
  await this.page.getByRole('button',{name:'Zoom out',exact:true}).click();await font(this.page,13);
  await wheel(this.page,-100);await font(this.page,14);
  await wheel(this.page,100);await font(this.page,13);
  await wheel(this.page,100,false);await font(this.page,13);
  await this.page.getByRole('button',{name:'Zoom in',exact:true}).click();await font(this.page,14);
  await this.page.reload();await expect(input(this.page)).toBeVisible();await font(this.page,14);
  await expect(input(this.page)).toContainText('const zoom = true;');
});
Then('editor zoom bindings can be recorded as keyboard and Shift wheel shortcuts',async function(){
  await selectPage(this.page, 'Settings', 'Controls');await selectDropdown(this.page,'Settings scope','global');
  const pane=this.page.getByRole('region',{name:'Keybindings',exact:true});
  await pane.getByLabel('Filter keybindings').fill('Zoom in');
  const binding=pane.getByRole('textbox',{name:'Zoom in shortcut 1',exact:true});
  await expect(binding).toHaveValue('Shift + Wheel up');await binding.click();await binding.press('F10');await saved(this.page);
  await selectPage(this.page,'Editor');await input(this.page).focus();await this.page.keyboard.press('F10');await font(this.page,14);
  await wheel(this.page,-100);await font(this.page,14);
  await selectPage(this.page, 'Settings', 'Controls');await binding.click();await this.page.keyboard.down('Shift');await this.page.mouse.wheel(0,-100);await this.page.keyboard.up('Shift');await saved(this.page);
  await expect(binding).toHaveValue('Shift + Wheel up');
  await selectPage(this.page,'Editor');await wheel(this.page,-100);await font(this.page,15);
});

Then('the reset zoom shortcut restores the default editor font size',async function(){
  await this.page.getByRole('button',{name:'Zoom in',exact:true}).click();await font(this.page,14);
  await input(this.page).focus();await this.page.keyboard.press('ControlOrMeta+0');await font(this.page,13);
  await this.page.getByRole('button',{name:'Zoom out',exact:true}).click();await font(this.page,12);
  await input(this.page).focus();await this.page.keyboard.press('ControlOrMeta+0');await font(this.page,13);
  await this.page.reload();await expect(input(this.page)).toBeVisible();await font(this.page,13);
});
