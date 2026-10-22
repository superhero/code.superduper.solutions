// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const action=(page,label)=>page.getByRole('button',{name:label,exact:true});
async function invoke(page,label){await saved(page);await action(page,label).click();await saved(page);await expect(page.getByRole('alert')).toHaveCount(0);}
const wrapping=page=>page.getByRole('switch',{name:'Line wrapping',exact:true});
Then('file and settings history stay independent while the current panes remain selected',async function(){
  const layout=async()=>{
    const tabs=this.page.locator('.editor-tabs > .file-tabs');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.first().getByRole('button',{name:'Switch to file10.txt',exact:true})).toHaveClass(/active/);
    await expect(tabs.nth(1).getByRole('button',{name:'Focus split file file2.txt',exact:true})).toHaveClass(/active/);
  };
  const split=this.page.getByLabel('Split editor document',{exact:true});
  await expect(split).toHaveText('Second root filex');await layout();
  await invoke(this.page,'Undo');await expect(split).toHaveText('Second root file');await layout();
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await expect(action(this.page,'Undo')).toBeDisabled();await expect(action(this.page,'Redo')).toBeDisabled();
  await wrapping(this.page).click();await saved(this.page);await expect(wrapping(this.page)).toBeChecked();
  await invoke(this.page,'Undo');await expect(wrapping(this.page)).not.toBeChecked();
  await selectPage(this.page,'Editor');await expect(action(this.page,'Redo')).toBeEnabled();
  await invoke(this.page,'Redo');await expect(split).toHaveText('Second root filex');await layout();
  await this.page.reload();await expect(split).toHaveText('Second root filex');await layout();
  await selectPage(this.page,'Settings');await expect(action(this.page,'Redo')).toBeEnabled();
  await invoke(this.page,'Redo');await expect(wrapping(this.page)).toBeChecked();
});
Then('global repository and file settings use independent history buttons',async function(){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await expect(action(this.page,'Undo')).toBeDisabled();await wrapping(this.page).click();await saved(this.page);
  await selectDropdown(this.page,'Settings scope','repository');await expect(action(this.page,'Undo')).toBeDisabled();
  await wrapping(this.page).click();await saved(this.page);await expect(wrapping(this.page)).not.toBeChecked();
  await selectDropdown(this.page,'Settings scope','file');await expect(action(this.page,'Undo')).toBeDisabled();
  await wrapping(this.page).click();await saved(this.page);await expect(wrapping(this.page)).toBeChecked();
  await selectDropdown(this.page,'Settings scope','repository');await invoke(this.page,'Undo');await expect(wrapping(this.page)).toBeChecked();
  await selectDropdown(this.page,'Settings scope','global');await invoke(this.page,'Undo');await expect(wrapping(this.page)).not.toBeChecked();
  await selectDropdown(this.page,'Settings scope','file');await expect(wrapping(this.page)).toBeChecked();
  await invoke(this.page,'Undo');await expect(wrapping(this.page)).not.toBeChecked();
  await this.page.reload();await selectDropdown(this.page,'Settings scope','repository');await expect(action(this.page,'Redo')).toBeEnabled();
  await invoke(this.page,'Redo');await expect(wrapping(this.page)).not.toBeChecked();
  await selectDropdown(this.page,'Settings scope','file');await invoke(this.page,'Redo');await expect(wrapping(this.page)).toBeChecked();
  await selectDropdown(this.page,'Settings scope','global');await invoke(this.page,'Redo');await expect(wrapping(this.page)).toBeChecked();
});
