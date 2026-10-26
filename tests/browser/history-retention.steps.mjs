// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
Then('startup retains two automatic changes for each edited file',async function(){
  const page=this.page;
  await selectPage(page, 'Settings', 'Git');await selectDropdown(page,'Settings scope','global');
  await expect(page.getByRole('tabpanel',{name:'Git',exact:true}).getByRole('heading',{name:'Staging history',exact:true})).toBeVisible();
  const slider=page.getByRole('slider',{name:'Changes retained per file',exact:true});
  await expect(slider).toHaveAttribute('aria-valuetext','300 changes');
  await expect.poll(async()=>Number(await slider.inputValue())).toBeCloseTo(Math.log1p(300),12);
  await expect(slider).toHaveAttribute('min','0');await expect(slider).toHaveAttribute('max',String(Math.log1p(10000)));
  await slider.evaluate(e=>{e.value=String(Math.log1p(2));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(page.locator('output[for="setting-historyLimit"]')).toHaveText('2 changes');await saved(page);
  await selectPage(page,'Editor');
  for(const path of ['file2.txt','file10.txt']){
    await page.getByRole('treeitem',{name:path,exact:true}).locator(':scope > .tree-row').click();
    const editor=page.getByLabel('Code editor document',{exact:true});
    for(let index=1;index<=5;index++){await editor.fill(`${path} edit ${index}`);await saved(page);}
  }
  await page.reload({waitUntil:'networkidle'});await saved(page);
  await expect(page.getByLabel('Code editor document',{exact:true})).toHaveText('file10.txt edit 5');
  await selectPage(page,'History');
  const graph=page.getByRole('list',{name:'Staged changes',exact:true});
  for(const path of ['file2.txt','file10.txt'])await expect(graph.locator(`.line-change[data-path="${path}"]`)).toHaveCount(2);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await saved(page);
  await expect(page.getByLabel('Code editor document',{exact:true})).toHaveText('file10.txt edit 4');
  await page.getByRole('button',{name:'Undo',exact:true}).click();await saved(page);
  await expect(page.getByLabel('Code editor document',{exact:true})).toHaveText('Tenth root file');
  await page.getByRole('button',{name:'Redo',exact:true}).click();await saved(page);
  await expect(page.getByLabel('Code editor document',{exact:true})).toHaveText('file10.txt edit 4');
  await page.getByRole('button',{name:'Redo',exact:true}).click();await saved(page);
  await expect(page.getByLabel('Code editor document',{exact:true})).toHaveText('file10.txt edit 5');
});
