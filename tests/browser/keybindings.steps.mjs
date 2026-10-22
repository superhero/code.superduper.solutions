// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const editor=page=>page.getByLabel('Code editor document',{exact:true});
const pane=page=>page.getByRole('region',{name:'Keybindings',exact:true});
async function bindings(page,scope='global'){
  await selectPage(page,'Settings');await selectDropdown(page,'Settings scope',scope);
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
