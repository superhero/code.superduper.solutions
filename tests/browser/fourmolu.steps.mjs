// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Given,When,Then} from '@cucumber/cucumber';
import{expect}from'@playwright/test';
import{selectPage,selectDropdown}from'./navigation.helpers.mjs';
import {installFormatterPackage} from './formatter.helpers.mjs';
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
const document=page=>page.getByLabel('Code editor document',{exact:true});
const contents=page=>document(page).locator('.cm-line').allTextContents().then(lines=>lines.join('\n'));
const history=async page=>(await repositoryHistories(page)).edits;
const versions=async page=>(await repositoryHistories(page)).commits;
async function open(world){await selectPage(world.page,'Editor');await world.page.getByRole('treeitem',{name:world.fourmoluPath,exact:true}).locator(':scope > .tree-row').click();await saved(world.page);}
Given('a Fourmolu repository with a {string} document is imported',async function(path){
  this.fourmoluPath=path;
  this.fourmoluInput=path.endsWith('.hsig')?'signature Example where\nvalue::Int\n':'module Main where\nmain=do\n putStrLn "<div> &amp; 🙂"\n pure ()\n';
  this.fourmoluOutput=path.endsWith('.hsig')?'signature Example where\n\nvalue :: Int\n':'module Main where\n\nmain = do\n      putStrLn "<div> &amp; 🙂"\n      pure ()\n';
  const directory=join(this.artifactDirectory,'haskell');await mkdir(directory,{recursive:true});
  await writeFile(join(directory,path),this.fourmoluInput);await writeFile(join(directory,'fourmolu.yaml'),'indentation: 6\n');
  await this.page.getByLabel('Import directory',{exact:true}).setInputFiles(directory);await saved(this.page);await open(this);
  await expect(this.page.getByRole('button',{name:'Format document',exact:true})).toBeDisabled();
  assert.equal(this.requests.filter(item=>item.url.includes('/formatters/')).length,0);
});
When('I explicitly install Fourmolu',async function(){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','global');
  await installFormatterPackage(this.page,'fourmolu');
  await open(this);this.fourmoluHistory=await history(this.page);this.fourmoluVersions=await versions(this.page);
});
Then('Fourmolu preserves plain source and creates one undoable edit',async function(){
  await expect.poll(()=>contents(this.page),{timeout:20_000}).toBe(this.fourmoluOutput);await saved(this.page);
  assert.equal((await history(this.page)).length,this.fourmoluHistory.length+1);assert.deepEqual(await versions(this.page),this.fourmoluVersions);
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);assert.equal(await contents(this.page),this.fourmoluInput);
  await this.page.getByRole('button',{name:'Redo',exact:true}).click();await saved(this.page);assert.equal(await contents(this.page),this.fourmoluOutput);
});
Then('installed Fourmolu formats again offline after reload',async function(){
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await this.page.context().setOffline(true);
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await this.page.getByRole('button',{name:'Format document',exact:true}).click();
  await expect.poll(()=>contents(this.page),{timeout:20_000}).toBe(this.fourmoluOutput);await saved(this.page);
  assert.equal(this.requests.filter(item=>item.url.includes('/formatters/')).length,1);await this.page.context().setOffline(false);
});
Then('invalid Haskell reports an error without a formatting edit',async function(){
  await document(this.page).click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText('module Main where\nmain =\n');await saved(this.page);
  const text=await contents(this.page),before=await history(this.page);
  await this.page.getByRole('button',{name:'Format document',exact:true}).click();
  await expect(this.page.getByRole('alert')).toContainText('Fourmolu',{timeout:20_000});
  assert.equal(await contents(this.page),text);assert.deepEqual(await history(this.page),before);
});
