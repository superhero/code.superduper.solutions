// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import {formatterPane,formatterRow,selectFormatterPackage,installFormatterPackage,formatterProvider} from './formatter.helpers.mjs';
import {formats,providers} from '../../src/lib/formatting/formats.ts';
import { selectPage } from './navigation.helpers.mjs';
const region=formatterPane;
const row=formatterRow;
// Explicit UI installation is also used by the real-formatting provider scenarios.
When('I view the formatter installation settings', async function () {
  await selectPage(this.page, 'Settings', 'Formatting');
  const scope = this.page.getByRole('button', { name: 'Settings scope', exact: true });
  if (await scope.getAttribute('data-value') !== 'global') {
    await scope.click(); await this.page.getByRole('menuitemradio', { name: 'Global defaults', exact: true }).click();
  }
  await expect(region(this.page)).toBeVisible();
  await expect(region(this.page).getByText('Reading installed formatters…')).toHaveCount(0);
});
When('I install the {string} formatter package', async function (name) {
  await installFormatterPackage(this.page,name);
});
When('I remove the {string} formatter package', async function (name) {
  await selectFormatterPackage(this.page,name);
  await row(this.page,name).getByRole('button', { name: `Uninstall ${name}`, exact: true }).click();
  await expect(row(this.page, name).getByRole('status')).toHaveText('Not installed');
});
Then('all 38 formatters are offered without downloading their payloads', async function () {
  await region(this.page).getByLabel('Find a formatter preference',{exact:true}).fill('');
  await expect(region(this.page).locator('[data-format]')).toHaveCount(formats.length);
  await expect(region(this.page).locator('[data-format] .navigation-trigger[data-value="none"]')).toHaveCount(0);
  await expect(region(this.page).getByRole('button',{name:/^Install /})).toHaveCount(formats.length);
  assert.equal(new Set(formats.flatMap(format=>format.providers)).size,38);
  assert.equal(providers.length,38);
  await expect(this.page.getByRole('region',{name:'Formatters',exact:true})).toHaveCount(1);
  assert.equal(this.requests.filter(item=>item.url.includes('/formatters/')).length,0);
});
Then('the {string} formatter package is installed', async function (name) {
  await expect(row(this.page, name).getByRole('status')).toHaveText('Installed');
});
Then('the {string} formatter package is not installed', async function (name) {
  await expect(row(this.page, name).getByRole('status')).toHaveText('Not installed');
});
When('I reload with all formatter downloads blocked', async function () {
  await this.context.route('**/formatters/**', route => { throw new Error(`An installed formatter tried to download: ${route.request().url()}`); });
  await this.page.reload({ waitUntil: 'networkidle' });
  await expect(this.page.getByRole('status', { name: 'Persistence status', exact: true })).toHaveText('All changes saved');
});
When('I capture the installed {string} formatter package for storage migration',async function(name){
  const id=formatterProvider(name).id;
  const bytes=await this.page.evaluate(async id=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('code-formatter-packages');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const record=await new Promise((resolve,reject)=>{const request=db.transaction('packages').objectStore('packages').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();
    return Array.from(new Uint8Array(record.bytes));
  },id);
  this.exportedFormatter=Buffer.from(bytes);
});
Then('the formatter license text is readable for {string}', async function(name){
  await selectPage(this.page, 'Settings', 'Licenses');
  const notices=this.page.getByRole('region',{name:'Licenses and notices',exact:true});
  await notices.locator(':scope > details > summary').click();
  const notice=notices.locator('details').filter({has: this.page.locator('summary').filter({hasText:/^@dprint\/json/})}).last();
  await expect(notice).toBeVisible();await notice.locator(':scope > summary').click();
  await expect(notice.locator('pre')).toContainText('Copyright');
});
When('the next formatter download contains corrupt bytes', async function () {
  this.corruptDownload = async route => {
    const response = await route.fetch();
    const bytes = await response.body();
    bytes[bytes.length - 2] ^= 1;
    await route.fulfill({ response, body: bytes });
  };
  await this.context.route('**/formatters/**', this.corruptDownload);
});
When('I attempt to install the {string} formatter package', async function (name) {
  await selectFormatterPackage(this.page,name);
  await row(this.page,name).getByRole('button', { name: `Install ${name}`, exact: true }).click();
});
Then('a formatter checksum error is displayed', async function () {
  await expect(region(this.page).getByRole('alert')).toContainText('checksum does not match');
});
When('I dismiss the formatter download interception', async function () {
  await this.context.unroute('**/formatters/**', this.corruptDownload);
});
When('the next formatter download is held', async function () {
  await this.context.route('**/formatters/**', async route => {
    await new Promise(resolve => { this.releaseDownload = resolve; });
    await route.abort().catch(() => {});
  });
});
When('I begin installing the {string} formatter package', async function (name) {
  await selectFormatterPackage(this.page,name);
  await row(this.page,name).getByRole('button', { name: `Install ${name}`, exact: true }).click();
  await expect(region(this.page).getByRole('button', { name: 'Cancel', exact: true }).first()).toBeVisible();
});
When('I cancel the formatter download', async function () {
  // An intentional fetch abort may produce Chromium's resource console message.
  this.expectedErrors.push('Failed to load resource');
  await region(this.page).getByRole('button', { name: 'Cancel', exact: true }).first().click();
  this.releaseDownload?.();
});
When('the installed JSON package belongs to an older application catalog', async function () {
  await this.page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const open = indexedDB.open('code-formatter-packages'); open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const tx = db.transaction('packages', 'readwrite'), store = tx.objectStore('packages');
    const get = store.get('dprint-json');
    get.onsuccess = () => { store.put({ ...get.result, version: 'older', sha256: 'previous-reviewed-digest' }); };
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
  });
  await this.page.reload({ waitUntil: 'networkidle' });
});
Then('the JSON formatter offers an update', async function () {
  await expect(row(this.page,'JSON').getByRole('button', { name: 'Update JSON', exact: true })).toBeVisible();
  await expect(row(this.page, 'JSON').getByRole('status')).toContainText('older installed');
});
When('I attempt to update the JSON formatter', async function () {
  await row(this.page,'JSON').getByRole('button', { name: 'Update JSON', exact: true }).click();
});
Then('the previous JSON formatter installation is preserved', async function () {
  await expect(row(this.page, 'JSON').getByRole('status')).toContainText('older installed');
  await expect(row(this.page,'JSON').getByRole('button', { name: 'Uninstall JSON', exact: true })).toBeEnabled();
});
When('I update the JSON formatter', async function () {
  await row(this.page,'JSON').getByRole('button', { name: 'Update JSON', exact: true }).click();
  await expect(row(this.page, 'JSON').getByRole('status')).toHaveText('Installed');
});
When('I remove JSON formatting support from another tab', async function () {
  const companion = await this.context.newPage();
  this.observePage(companion);
  await companion.goto(this.baseURL, { waitUntil: 'networkidle' });
  await expect(region(companion)).toBeVisible();
  await selectFormatterPackage(companion,'JSON');
  await row(companion,'JSON').getByRole('button', { name: 'Uninstall JSON', exact: true }).click();
  await expect(row(companion, 'JSON').getByRole('status')).toHaveText('Not installed');
  await companion.close();
});
When('I switch to the Editor page', async function () { await selectPage(this.page, 'Editor'); });
When('the exported JSON package is reopened from legacy installation storage', async function () {
  const {createHash} = await import('node:crypto');
  const bytes = this.exportedFormatter;
  const envelope = JSON.parse(bytes.toString());
  await this.page.goto('about:blank');
  const blank = route => route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><body></body>'});
  await this.page.route(`${this.baseURL}/`,blank);
  await this.page.goto(`${this.baseURL}/`);
  await this.page.evaluate(async ({payload,id,version,sha256})=>{
    await new Promise((resolve,reject)=>{const remove=indexedDB.deleteDatabase('code-formatter-packages');remove.onsuccess=resolve;remove.onerror=()=>reject(remove.error);remove.onblocked=()=>reject(new Error('Legacy fixture database is blocked'));});
    const db=await new Promise((resolve,reject)=>{const open=indexedDB.open('code-formatter-packages',1);open.onupgradeneeded=()=>open.result.createObjectStore('packages',{keyPath:'id'});open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
    const binary=atob(payload),bytes=new Uint8Array(binary.length);
    for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
    const tx=db.transaction('packages','readwrite');tx.objectStore('packages').put({id,version,sha256,bytes:bytes.buffer,installedAt:Date.now()});
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{payload:bytes.toString('base64'),id:envelope.id,version:envelope.version,sha256:createHash('sha256').update(bytes).digest('hex')});
  await this.page.unroute(`${this.baseURL}/`,blank);
  await this.page.reload({waitUntil:'networkidle'});
  await expect(this.page.getByRole('status',{name:'Persistence status',exact:true})).toHaveText('All changes saved');
  await expect(region(this.page)).toBeVisible();
});

Then('formatter package import controls are absent', async function () {
  await expect(this.page.getByRole('button', {name:'Import package', exact:true})).toHaveCount(0);
  await expect(this.page.getByLabel('Import formatter package', {exact:true})).toHaveCount(0);
});
