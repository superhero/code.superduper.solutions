// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BeforeAll, AfterAll, Before, After, Given, When, Then, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium, expect } from '@playwright/test';
import { selectPage } from '../navigation.helpers.mjs';
import { formatterRow, selectFormatterPackage } from '../formatter.helpers.mjs';

setDefaultTimeout(180_000);
let browser, manifest, baseURL;
BeforeAll(async function () {
  const url = new URL(process.env.CODE_PAGES_URL || 'https://code.superduper.solutions/');
  const localCandidate = url.hostname === '127.0.0.1' && url.protocol === 'http:';
  assert.ok(localCandidate || url.protocol === 'https:');
  assert.ok(localCandidate || url.hostname === 'code.superduper.solutions' || /^(?:[a-z0-9-]+\.)?code-superduper-solutions\.pages\.dev$/.test(url.hostname));
  baseURL = url.origin + '/';
  assert.ok(process.env.CODE_DEPLOYMENT_MANIFEST, 'Set CODE_DEPLOYMENT_MANIFEST to the reviewed local manifest.');
  manifest = JSON.parse(await readFile(process.env.CODE_DEPLOYMENT_MANIFEST, 'utf8'));
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.BROWSER_EXECUTABLE_PATH} : {}) });
});
Before(async function () { this.context = await browser.newContext(); this.page = await this.context.newPage(); });
After(async function () { await this.context?.close(); });
AfterAll(async function () { await browser?.close(); });

Given('the published Pages editor is open', async function () {
  this.response = await this.page.goto(baseURL, {waitUntil:'networkidle', timeout:60_000});
  assert.equal(this.response.status(), 200);
  await expect(this.page.getByRole('status', {name:'Persistence status', exact:true})).toHaveText('All changes saved', {timeout:60_000});
  await selectPage(this.page, 'Settings');
  await expect(this.page.getByRole('region', {name:'Formatters', exact:true})).toBeVisible();
});
Then('Pages serves the browser isolation headers', async function () {
  const headers = this.response.headers();
  assert.equal(headers['cross-origin-opener-policy'], 'same-origin');
  assert.equal(headers['cross-origin-embedder-policy'], 'credentialless');
  assert.deepEqual(await this.page.evaluate(() => ({secure:isSecureContext, isolated:crossOriginIsolated})), {secure:true, isolated:true});
});
Then('the editor offers the deployed corresponding source archive', async function () {
  const notices = this.page.getByRole('region', {name:'Licenses and notices', exact:true});
  await notices.locator(':scope > details > summary').click();
  await expect(notices.getByRole('link', {name:'Corresponding source', exact:true})).toHaveAttribute('href', './source.tar.gz');
  assert.ok(manifest.files.some(file => file.path === 'source.tar.gz'));
});
Then('the published Pages assets match the deployment manifest', async function () {
  const files = manifest.files.filter(file => !['_headers','_redirects'].includes(file.path));
  let next = 0;
  await Promise.all(Array.from({length:3}, async () => {
    while (next < files.length) {
      const file = files[next++];
      const response = await fetch(new URL(file.path, baseURL), {signal:AbortSignal.timeout(120_000)});
      assert.equal(response.status, 200, file.path);
      const hash = createHash('sha256'); let received = 0;
      for await (const chunk of response.body) { received += chunk.byteLength; hash.update(chunk); }
      assert.equal(received, file.bytes, file.path);
      assert.equal(hash.digest('hex'), file.sha256, file.path);
    }
  }));
  this.attach(JSON.stringify({origin:baseURL, verifiedFiles:files.length}), 'application/json');
});
When('I install the published split formatter and language packages', async function () {
  await selectFormatterPackage(this.page, 'Roslyn');
  await formatterRow(this.page, 'Roslyn').getByRole('button', {name:'Install Roslyn', exact:true}).click();
  await expect(formatterRow(this.page, 'Roslyn').getByRole('status')).toHaveText('Installed', {timeout:120_000});
  const engines = this.page.getByRole('region', {name:'Language engines', exact:true});
  await engines.getByRole('button', {name:'Install Taplo language engine', exact:true}).first().click();
  await expect(engines.getByRole('button', {name:'Uninstall Taplo language engine', exact:true}).first()).toBeVisible({timeout:120_000});
});
Then('the installed split packages retain the deployment checksums', async function () {
  for (const [database,id] of [['code-formatter-packages','dprint-roslyn'],['code-language-packages','toml']]) {
    const expected = manifest.splitPackages.find(item => item.id === id);
    assert.ok(expected, id);
    const actual = await this.page.evaluate(async ({database,id}) => {
      const db = await new Promise((resolve,reject) => { const request=indexedDB.open(database); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
      try {
        const record = await new Promise((resolve,reject) => { const request=db.transaction('packages').objectStore('packages').get(id); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', record.bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
        return {bytes:record.bytes.byteLength,sha256:record.sha256,actualHash:hash};
      } finally { db.close(); }
    }, {database,id});
    assert.deepEqual(actual, {bytes:expected.bytes,sha256:expected.sha256,actualHash:expected.sha256});
  }
});
