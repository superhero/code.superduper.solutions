// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
const sidebar=page=>page.getByRole('complementary',{name:'Repository explorer',exact:true});
const divider=page=>page.getByRole('separator',{name:'Resize repository explorer',exact:true});
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const width=page=>sidebar(page).evaluate(element=>element.getBoundingClientRect().width);
async function sized(page,value){await expect.poll(()=>width(page)).toBe(value);await saved(page);}
async function drag(page,delta,release=true){
  const box=await divider(page).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+delta,box.y+box.height/2,{steps:8});if(release)await page.mouse.up();
}
Then('the explorer divider resizes and persists without changing file history',async function(){
  const original=await width(this.page);await drag(this.page,90);await sized(this.page,original+90);
  await expect(sidebar(this.page)).toHaveCSS('border-right-width','2px');
  await this.page.reload();await expect(divider(this.page)).toBeVisible();await sized(this.page,original+90);
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toContainText('const untouched = true;');
});
Then('explorer resizing can be cancelled and controlled with the keyboard',async function(){
  const original=await width(this.page);await drag(this.page,100,false);await expect.poll(()=>width(this.page)).toBe(original+100);
  await this.page.keyboard.press('Escape');await this.page.mouse.up();await sized(this.page,original);
  const handle=divider(this.page);await handle.focus();await handle.press('ArrowRight');await sized(this.page,original+16);
  await handle.press('Home');await sized(this.page,160);
  await handle.press('End');await sized(this.page,600);
  await this.page.setViewportSize({width:700,height:900});await sized(this.page,380);
  await expect(handle).toHaveAttribute('aria-valuenow','380');
  expect((await this.page.locator('.workbench').boundingBox()).width).toBeGreaterThanOrEqual(320);
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toBeVisible();
});
