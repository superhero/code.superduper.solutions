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
const packages=page=>page.getByRole('region',{name:'Syntax highlighting',exact:true});
async function personal(page){await selectPage(page,'Settings');await selectDropdown(page,'Settings scope','global');}
async function open(page,path){await selectPage(page,'Editor');await page.getByRole('treeitem',{name:path,exact:true}).locator(':scope > .tree-row').click();await saved(page);}
const tokens=page=>page.locator('.cm-content .cm-line span');
Given('a repository with GraphQL WGSL and Terraform files is imported',async function(){
  const directory=join(this.artifactDirectory,'syntax-repository');await mkdir(directory,{recursive:true});
  for(const [path,source] of Object.entries({
    'query.graphql':'query Find($id: ID!) { user(id: $id) { name } }',
    'shader.wgsl':'@vertex fn main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }',
    'example.md':'```terraform\nresource "null_resource" "example" {\n  triggers = { answer = "42" }\n}\n```',
    'main.tf':'resource "null_resource" "example" {\n  triggers = { answer = "42" }\n}\n'
  }))await writeFile(join(directory,path),source);
  await this.page.getByLabel('Import directory',{exact:true}).setInputFiles(directory);await saved(this.page);
});
Then('GraphQL and WGSL highlight without package downloads',async function(){
  for(const path of ['query.graphql','shader.wgsl']){await open(this.page,path);await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(4);}
  assert.ok(!this.requests.some(item=>/\/(syntax|languages)\//.test(item.url)));
  await expect(this.page.locator('.cm-lintRange')).toHaveCount(0);
});
When('I install and activate HCL syntax',async function(){
  await personal(this.page);
  await expect(this.page.getByRole('button',{name:'HCL / Terraform syntax highlighting',exact:true})).toHaveAttribute('data-value','enabled');
  await expect(packages(this.page).getByRole('button',{name:'Install HCL / Terraform syntax package',exact:true})).toHaveCount(1);
  await selectDropdown(this.page,'HCL / Terraform syntax highlighting','enabled');await saved(this.page);
  assert.ok(!this.requests.some(item=>item.url.includes('/syntax/')));
  await this.context.setOffline(false);
  await packages(this.page).getByRole('button',{name:'Install HCL / Terraform syntax package',exact:true}).click();
  await expect(packages(this.page).getByRole('button',{name:'Uninstall HCL / Terraform syntax package',exact:true})).toBeVisible();
  await expect(this.page.getByRole('button',{name:'HCL / Terraform syntax highlighting',exact:true})).toHaveAttribute('data-value','enabled');
});
Then('Terraform highlights immediately after installation',async function(){
  await open(this.page,'main.tf');await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(3);
});
When('I enable HCL syntax and reload offline',async function(){
  await personal(this.page);await selectDropdown(this.page,'HCL / Terraform syntax highlighting','enabled');await saved(this.page);
  await open(this.page,'main.tf');await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(3);
  await open(this.page,'example.md');
  await expect(this.page.locator('.cm-line span').filter({hasText:/^resource$/})).toHaveCount(1);
  await open(this.page,'main.tf');
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await this.context.setOffline(true);
});
Then('Terraform has structured syntax highlighting',async function(){
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(3);
});
When('I disable HCL syntax for this repository',async function(){
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','repository');
  await selectDropdown(this.page,'HCL / Terraform syntax highlighting','disabled');await saved(this.page);
});
Then('Terraform is plain text and undo restores its highlighting',async function(){
  // Inspect the mounted editor without recording another navigation action.
  await expect(tokens(this.page)).toHaveCount(0);
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(3);
});
Then('the syntax pane supports shared notices uninstall and reinstallation',async function(){
  await personal(this.page);
  await expect(this.page.getByRole('region',{name:'Syntax packages',exact:true})).toHaveCount(0);
  const notices=this.page.getByRole('region',{name:'Licenses and notices',exact:true});
  await notices.locator(':scope > details > summary').click();
  await expect(notices.locator('summary').filter({hasText:/^codemirror-lang-hcl/})).toHaveCount(1);
  await packages(this.page).getByRole('button',{name:'Uninstall HCL / Terraform syntax package',exact:true}).click();
  await expect(packages(this.page).getByRole('button',{name:'Install HCL / Terraform syntax package',exact:true})).toBeVisible();
  await expect(tokens(this.page)).toHaveCount(0);
  await this.context.setOffline(false);
  await packages(this.page).getByRole('button',{name:'Install HCL / Terraform syntax package',exact:true}).click();
  await expect(packages(this.page).getByRole('button',{name:'Uninstall HCL / Terraform syntax package',exact:true})).toBeVisible();
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(3);
  await this.context.setOffline(false);
});

const bracketNumber=page=>page.locator('.cm-content .cm-line span').filter({hasText:/^0$/});
Given('a repository with Handlebars templates is imported',async function(){
  const directory=join(this.artifactDirectory,'handlebars-repository');await mkdir(directory,{recursive:true});
  const files={
    'page.hbs':'{{#if ready}}\n<section class="card"><h1>{{title}}</h1></section>\n{{else}}\n<p>Waiting</p>\n{{/if}}',
    'access.handlebars':'<p>{{items.[0].name}}</p>',
    'examples.md':'```hbs\n<p>{{items.[0].name}}</p>\n```'
  };
  for(const [path,source]of Object.entries(files))await writeFile(join(directory,path),source);
  await this.page.getByLabel('Import directory',{exact:true}).setInputFiles(directory);await saved(this.page);
  await open(this.page,'page.hbs');
});
Then('stable Handlebars highlights HTML and templates and folds its blocks without downloads',async function(){
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(8);
  assert.ok(!this.requests.some(item=>/\/(syntax|languages)\//.test(item.url)));
  await this.page.locator('[title="Fold line"]').first().click();
  await expect(this.page.locator('.cm-foldPlaceholder')).toHaveCount(1);
  await this.page.locator('.cm-foldPlaceholder').click();
  await expect(this.page.locator('.cm-foldPlaceholder')).toHaveCount(0);
  await expect(this.page.getByLabel('Code editor document',{exact:true})).toContainText('Waiting');
});
When('I install and activate the Handlebars beta',async function(){
  await open(this.page,'access.handlebars');await expect(bracketNumber(this.page)).toHaveCount(0);
  await personal(this.page);
  await expect(this.page.getByRole('button',{name:'Handlebars syntax provider',exact:true})).toHaveAttribute('data-value','stable');
  await this.page.getByRole('button',{name:'Handlebars syntax provider',exact:true}).click();
  await expect(this.page.getByRole('menuitemradio',{name:'Gentrace beta · Not installed',exact:true})).toHaveCount(1);
  await this.page.keyboard.press('Escape');
  await selectDropdown(this.page,'Handlebars syntax provider','beta');await saved(this.page);
  await packages(this.page).getByRole('button',{name:'Install Handlebars (Gentrace beta) syntax package',exact:true}).click();
  await expect(packages(this.page).getByRole('button',{name:'Uninstall Handlebars (Gentrace beta) syntax package',exact:true})).toBeVisible();
  await open(this.page,'access.handlebars');await expect(bracketNumber(this.page)).toHaveCount(1);
});
When('I select the Handlebars beta and reload offline',async function(){
  await personal(this.page);await selectDropdown(this.page,'Handlebars syntax provider','beta');await saved(this.page);
  await open(this.page,'access.handlebars');await expect(bracketNumber(this.page)).toHaveCount(1);
  await open(this.page,'examples.md');await expect(bracketNumber(this.page)).toHaveCount(1);
  await open(this.page,'access.handlebars');await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await this.context.setOffline(true);
});
Then('the Handlebars beta remains selected and repository overrides are undoable',async function(){
  await expect(bracketNumber(this.page)).toHaveCount(1);
  await selectPage(this.page,'Settings');await selectDropdown(this.page,'Settings scope','repository');
  await selectDropdown(this.page,'Handlebars syntax provider','stable');await saved(this.page);
  await expect(bracketNumber(this.page)).toHaveCount(0);
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await expect(bracketNumber(this.page)).toHaveCount(1);
});
Then('removing the Handlebars beta restores stable highlighting',async function(){
  await personal(this.page);
  await packages(this.page).getByRole('button',{name:'Uninstall Handlebars (Gentrace beta) syntax package',exact:true}).click();
  await expect(packages(this.page).getByRole('button',{name:'Install Handlebars (Gentrace beta) syntax package',exact:true})).toBeVisible();
  await expect(bracketNumber(this.page)).toHaveCount(0);
  await open(this.page,'page.hbs');await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(8);
  await expect(this.page.getByRole('alert')).toHaveCount(0);
  await this.context.setOffline(false);
});

Then('included syntax settings list all languages and disabling GraphQL persists',async function(){
  await open(this.page,'query.graphql');await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(4);
  await personal(this.page);
  const pane=this.page.getByRole('region',{name:'Syntax highlighting',exact:true});
  await expect(pane.getByRole('button',{name:'GraphQL syntax highlighting',exact:true})).toBeVisible();
  await expect(pane.getByRole('button',{name:'Python syntax highlighting',exact:true})).toHaveCount(0);
  await pane.getByRole('button',{name:/^Show \d+ more of/}).click();
  await pane.getByLabel('Filter syntax highlighting').fill('Python');
  await expect(pane.getByRole('button',{name:'Python syntax highlighting',exact:true})).toBeVisible();
  await pane.getByLabel('Filter syntax highlighting').fill('GraphQL');
  await selectDropdown(this.page,'GraphQL syntax highlighting','disabled');await saved(this.page);
  await expect(tokens(this.page)).toHaveCount(0);
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);
  await expect(tokens(this.page)).toHaveCount(0);
  await selectDropdown(this.page,'Settings scope','repository');
  await selectDropdown(this.page,'GraphQL syntax highlighting','enabled');await saved(this.page);
  await expect.poll(()=>tokens(this.page).count()).toBeGreaterThan(4);
  await this.page.getByRole('button',{name:'Undo',exact:true}).click();await saved(this.page);
  await expect(tokens(this.page)).toHaveCount(0);
});
