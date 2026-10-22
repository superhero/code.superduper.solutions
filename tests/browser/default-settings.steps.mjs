// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const select=(page,label)=>page.getByRole('button',{name:label,exact:true});
Then('fresh browser preferences match the chosen default settings',async function(){
  const page=this.page;
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await expect(page.locator('html')).toHaveAttribute('data-palette','bonfire');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await selectPage(page,'Settings');
  for(const [label,value] of [['Color mode','dark'],['Palette','bonfire'],['Interface font','google:Geomini'],['Editor font','google:JetBrains Mono'],['Indentation','spaces']]){
    await expect(select(page,label)).toHaveAttribute('data-value',value);
  }
  await expect(page.getByRole('radio',{name:'Medium',exact:true})).toBeChecked();
  for(const [label,value] of [['Indent size','2'],['Tab width','4'],['Font size','13'],['Line height','1.7']])await expect(page.getByRole('slider',{name:label,exact:true})).toHaveValue(value);
});
Then('explicit appearance and tab width choices survive reload',async function(){
  const page=this.page;await selectPage(page,'Settings');
  await selectDropdown(page,'Color mode','light');await saved(page);
  await selectDropdown(page,'Palette','sunset');await saved(page);
  const width=page.getByRole('slider',{name:'Tab width',exact:true});
  await width.focus();await width.press('ArrowLeft');await width.press('ArrowLeft');await width.press('Tab');await saved(page);
  await page.reload();await saved(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('html')).toHaveAttribute('data-palette','sunset');
  await expect(select(page,'Color mode')).toHaveAttribute('data-value','light');
  await expect(page.getByRole('slider',{name:'Tab width',exact:true})).toHaveValue('2');
});
Then('the page without JavaScript uses the chosen default appearance',async function(){
  const context=await this.context.browser().newContext({javaScriptEnabled:false});
  try{
    const page=await context.newPage();await page.goto(this.baseURL);
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(page.locator('html')).toHaveAttribute('data-palette','bonfire');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expect(page.locator('#startup-status')).toBeVisible();
  }finally{await context.close();}
});
