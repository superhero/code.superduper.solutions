// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
Then('the Find footer controls share a vertical center and Replace aligns below Find',async function(){
  await this.page.getByLabel('Code editor document',{exact:true}).focus();await this.page.keyboard.press('Control+f');
  const field=this.page.getByRole('textbox',{name:'Find',exact:true});await expect(field).toBeFocused();await this.page.evaluate(()=>document.fonts.ready);
  const footer=this.page.locator('.cm-search');
  const geometry=await footer.evaluate(element=>{
    const field=element.querySelector('input[name="search"]'),rect=field.getBoundingClientRect();
    const controls=[...element.querySelectorAll('button[name="toggle-replace"],button[name="toggle-replace"] span,.cm-search-find-row label,.cm-search-find-row label input,.cm-search-find-row label span')];
    return {height:rect.height,center:rect.top+rect.height/2,margin:getComputedStyle(field).margin,controls:controls.map(control=>{const r=control.getBoundingClientRect();return {name:control.tagName,center:r.top+r.height/2};})};
  });
  expect(geometry.height).toBe(28);expect(geometry.margin).toBe('0px');
  for(const control of geometry.controls)expect(Math.abs(control.center-geometry.center-1),control.name).toBeLessThan(.5);
  await footer.getByRole('button',{name:'Toggle replace',exact:true}).click();
  const replacement=footer.getByRole('textbox',{name:'Replace',exact:true});await expect(replacement).toBeVisible();
  const find=await field.boundingBox(),replace=await replacement.boundingBox();expect(Math.abs(find.x-replace.x)).toBeLessThan(.5);
});
