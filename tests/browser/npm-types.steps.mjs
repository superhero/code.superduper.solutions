// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Given,When,Then} from '@cucumber/cucumber';
import {expect} from '@playwright/test';
import {npmFixture,registryFixture} from '../fixtures/npm-type-packages.mjs';
import {selectPage,selectDropdown} from './navigation.helpers.mjs';
const panel=page=>page.getByRole('region',{name:'npm type libraries',exact:true});
const saved=page=>expect(page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
Given('the public npm type registry has deterministic declaration packages',async function(){
  const helper=npmFixture('typed-helper',{'index.d.ts':'export interface Router { get(path: string): void; }'});
  const express=npmFixture('@types/express',{'index.d.ts':'export function Router(): import("typed-helper").Router;'},{dependencies:{'typed-helper':'^1.0.0'}});
  const cookie=npmFixture('@types/cookie',{'index.d.ts':'export function parse(value: string): Record<string, string>;'});
  const react=npmFixture('@types/react',{'index.d.ts':'export function createElement(name: string): unknown;'});
  this.npmFixtures=[helper,express,cookie,react];this.npmRequests=[];
  const fixture=registryFixture(this.npmFixtures,[{name:'@types/cookie',version:'1.0.0',description:'Cookie parsing declarations'},{name:'@types/vue',version:'2.0.0',description:'Cookie stub',deprecated:'Stub'}]);
  await this.context.route('https://registry.npmjs.org/**',async route=>{this.npmRequests.push(route.request().url());const response=await fixture(route.request().url());await route.fulfill({status:response.status,headers:{'access-control-allow-origin':'*'},contentType:response.headers.get('content-type')??'application/json',body:Buffer.from(await response.arrayBuffer())});});
});
Given('npm serves a modified React archive',function(){this.npmFixtures.find(item=>item.metadata.name==='@types/react').archive[20]^=1;});
Given('the public npm registry is available for declaration installation',async function(){
  this.npmRequests=[];
  await this.context.route('https://registry.npmjs.org/**',async route=>{this.npmRequests.push(route.request().url());await route.continue();});
});
Then('common type packages are offered without querying npm',async function(){
  const choices=panel(this.page);await expect(choices).toBeVisible();
  for(const name of ['@types/react','@types/react-dom','@types/express','@types/koa'])await expect(choices.getByRole('button',{name:`Install ${name} types`,exact:true})).toBeVisible();
  await expect(choices.locator('[data-npm-type]')).toHaveCount(8);assert.equal(this.npmRequests.length,0);
});
When('I install the {string} npm declarations',{timeout:120000},async function(name){
  const choices=panel(this.page);
  if(!name.startsWith('@types/'))await choices.locator('summary').filter({hasText:'Libraries with included types'}).click();
  await choices.getByRole('button',{name:`Install ${name} types`,exact:true}).click();
  const uninstall=choices.getByRole('button',{name:`Uninstall ${name} types`,exact:true}),failure=choices.getByRole('alert');
  await expect(uninstall.or(failure)).toBeVisible({timeout:90000});
  if(await failure.isVisible())assert.fail(await failure.textContent());
  await expect(uninstall).toBeVisible();await saved(this.page);
  await expect(choices.getByRole('button',{name:`${name} types`,exact:true})).toHaveAttribute('data-value','enabled');
});
When('I search npm for {string}',async function(query){
  await panel(this.page).getByRole('searchbox',{name:'Find type packages',exact:true}).fill(query);
  await panel(this.page).getByRole('button',{name:'Search npm',exact:true}).click();
});
Then('the npm search offers cookie declarations without deprecated stubs',async function(){
  await expect(panel(this.page).getByRole('button',{name:'Install @types/cookie types',exact:true})).toBeVisible();
  await expect(panel(this.page).locator('[data-npm-type="@types/vue"]')).toHaveCount(0);
});
When('I attempt to install React declarations',async function(){await panel(this.page).getByRole('button',{name:'Install @types/react types',exact:true}).click();});
Then('React declarations stay uninstalled and disabled after the integrity error',async function(){
  const choices=panel(this.page);await expect(choices.getByRole('alert')).toContainText('integrity');
  await expect(choices.getByRole('button',{name:'Uninstall @types/react types',exact:true})).toHaveCount(0);
  await expect(choices.getByRole('button',{name:'@types/react types',exact:true})).toHaveAttribute('data-value','disabled');
});
Then('the {string} declarations provide an offline editor completion',async function(name){
  // Reload while online, then prepare the worker and read its declaration cache offline.
  await this.page.reload({waitUntil:'networkidle'});await saved(this.page);await this.context.setOffline(true);
  await selectPage(this.page,'Editor');
  const document=this.page.getByLabel('Code editor document',{exact:true});
  const [source,label]={
    '@types/express':['import { Router } from "express";\nconst router = Router();\nrouter.ge','get'],
    '@types/cookie':['import * as cookie from "cookie";\ncookie.par','parse'],
    '@types/react':['import * as React from "react";\nReact.cre','createElement'],
    svelte:['import { writable } from "svelte/store";\nconst store = writable(1);\nstore.upd','update'],
  }[name];
  await document.click();await this.page.keyboard.press('Control+a');await this.page.keyboard.insertText(source);await saved(this.page);
  await this.page.keyboard.press('Control+Space');
  await expect(this.page.locator('.cm-tooltip-autocomplete .cm-completionLabel').filter({hasText:new RegExp('^'+label+'$')})).toBeVisible({timeout:15000});
  await expect(this.page.locator('.intelligence-notice')).toHaveCount(0);
});
Then('installed npm declaration licenses appear in shared notices',async function(){
  await selectPage(this.page,'Settings');const notices=this.page.getByRole('region',{name:'Licenses and notices',exact:true});
  await notices.locator(':scope > details > summary').click();
  const item=notices.locator('summary').filter({hasText:/^@types\/express · LICENSE/});await expect(item).toHaveCount(1);await item.click();
  await expect(item.locator('..').locator('pre')).toContainText('Fixture authors');
});
Then('npm declaration activation is scoped and its export can be reimported offline',async function(){
  const page=this.page,choices=panel(page);await selectDropdown(page,'Settings scope','repository');
  await expect(choices.getByRole('button',{name:'@types/react types',exact:true})).toHaveAttribute('data-value','inherit');
  await selectDropdown(page,'@types/react types','disabled');await saved(page);
  await selectDropdown(page,'Settings scope','global');await expect(choices.getByRole('button',{name:'@types/react types',exact:true})).toHaveAttribute('data-value','enabled');
  await selectDropdown(page,'Settings scope','repository');await selectDropdown(page,'@types/react types','inherit');await saved(page);
  const downloadPromise=page.waitForEvent('download');await choices.getByRole('button',{name:'Export @types/react types',exact:true}).click();
  const file=join(this.artifactDirectory,'react.npm-types.json');await mkdir(this.artifactDirectory,{recursive:true});await(await downloadPromise).saveAs(file);
  await choices.getByRole('button',{name:'Uninstall @types/react types',exact:true}).click();
  await expect(choices.getByRole('button',{name:'Uninstall @types/react types',exact:true})).toHaveCount(0);await this.context.setOffline(true);
  await choices.getByLabel('Import npm type package file',{exact:true}).setInputFiles(file);
  await expect(choices.getByRole('button',{name:'Uninstall @types/react types',exact:true})).toBeVisible();
  const artifact=JSON.parse(await readFile(file,'utf8'));assert.equal(artifact.item.id,'npm:@types/react');
  await this.context.setOffline(false);
});
