// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Given,When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const tokens=page=>page.locator('.cm-content .cm-line span');
const mapping=page=>page.getByRole('region',{name:'Language mappings',exact:true});
Given('a repository with a custom suffix file is imported',async function(){
  const directory=join(this.artifactDirectory,'mapped-repository');await mkdir(directory,{recursive:true});
  this.mappedSource='const answer = 42;\n';
  await writeFile(join(directory,'example.custom'),this.mappedSource);
  await writeFile(join(directory,'example.js'),'export const original = 42;');
  await this.page.getByLabel('Import repository',{exact:true}).setInputFiles(directory);await saved(this.page);
  await this.page.getByRole('treeitem',{name:'example.custom',exact:true}).locator(':scope > .tree-row').click();await saved(this.page);
  await expect(tokens(this.page)).toHaveCount(0);
});
When('I map its suffix to JavaScript in personal settings',async function(){
  await selectPage(this.page, 'Settings', 'Languages');await selectDropdown(this.page,'Settings scope','global');
  await expect(this.page.getByRole('button',{name:'Language mode',exact:true})).toHaveCount(0);
  await mapping(this.page).getByLabel('Filename suffix',{exact:true}).fill('*.CUSTOM');
  await selectDropdown(this.page,'Language for new suffix','javascript');
  await mapping(this.page).getByRole('button',{name:'Add',exact:true}).click();await saved(this.page);
});
Then('its syntax updates without changing source files',async function(){
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(1);
  assert.equal(await this.page.locator('.cm-content').textContent(),this.mappedSource.trimEnd());
  await expect(tokens(this.page).filter({hasText:/^const$/})).toHaveCount(1);
});
When('I reload the application with its filename mapping',async function(){
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
});
Then('its personal suffix mapping remains selected',async function(){
  await mapping(this.page).getByLabel('Filter filename mappings',{exact:true}).fill('.custom');
  await expect(this.page.getByRole('button',{name:'Language for .custom',exact:true})).toHaveAttribute('data-value','javascript');
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(1);
});
When('I override the suffix as plain text for this repository',async function(){
  await selectDropdown(this.page,'Settings scope','repository');
  await mapping(this.page).getByLabel('Filter filename mappings',{exact:true}).fill('.custom');
  await selectDropdown(this.page,'Language for .custom','text');await saved(this.page);
});
Then('its syntax clears and undo restores the inherited mapping',async function(){
  await expect(tokens(this.page)).toHaveCount(0);
  await this.page.getByRole('button',{name:'Undo settings',exact:true}).click();await saved(this.page);
  await expect(this.page.getByRole('button',{name:'Language for .custom',exact:true})).toHaveAttribute('data-value','inherit');
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(1);
});

async function activateMappedTypescript(world,suffix){
  const {page}=world;
  world.mappedTypedSource='const answer: string = 42;';
  await page.getByLabel('Code editor document',{exact:true}).click();
  await page.keyboard.press('Control+a');await page.keyboard.insertText(world.mappedTypedSource);await saved(page);
  await selectPage(page, 'Settings', 'Languages');await selectDropdown(page,'Settings scope','global');
  await mapping(page).getByLabel('Filename suffix',{exact:true}).fill(suffix);
  await selectDropdown(page,'Language for new suffix','typescript');
  await mapping(page).getByRole('button',{name:'Add',exact:true}).click();await saved(page);
  const packages=page.getByRole('region',{name:'Language engines',exact:true});
  await selectDropdown(page,'TypeScript / TSX language engine','typescript');await saved(page);
  await packages.getByRole('button',{name:'Install TypeScript language engine',exact:true}).first().click();
  await expect(packages.getByRole('button',{name:'Uninstall TypeScript language engine',exact:true}).first()).toBeVisible();
  await selectDropdown(page,'TypeScript / TSX language engine','typescript');await saved(page);
  await selectPage(page,'Editor');
}
When('I map its suffix to TypeScript and activate the local engine',async function(){
  await activateMappedTypescript(this,'.custom');
});
When('I remap a JavaScript suffix to TypeScript and activate the local engine',async function(){
  await this.page.getByRole('treeitem',{name:'example.js',exact:true}).locator(':scope > .tree-row').click();await saved(this.page);
  await activateMappedTypescript(this,'.js');
});
Then('the mapped file receives TypeScript diagnostics without changing its contents',async function(){
  await expect(this.page.locator('.cm-lintRange')).toHaveCount(1,{timeout:15000});
  const range=this.page.locator('.cm-lintRange').first();await expect(range).toBeVisible({timeout:15000});
  await range.hover();await expect(this.page.locator('.cm-tooltip-lint')).toContainText("Type 'number' is not assignable to type 'string'");
  await expect(this.page.locator('.intelligence-notice')).toHaveCount(0);
  assert.equal(await this.page.locator('.cm-content').textContent(),this.mappedTypedSource);
});
