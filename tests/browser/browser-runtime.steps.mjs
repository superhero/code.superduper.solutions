// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { BROWSER_PROFILES } from '../../src/lib/assistant/browser/catalog.ts';

const models = BROWSER_PROFILES.slice(0, 3);
const runtimeModules = new WeakMap();
const runtime = page => page.evaluate(async url => (await import(url)).loadedModel(), runtimeModules.get(page));
const turns = page => page.evaluate(() => globalThis.browserRuntimeFixture?.turns ?? []);
const finish = page => page.evaluate(() => globalThis.browserRuntimeFixture.waiting.shift()());
async function choose(page, index) {
  await page.getByRole('button', { name: 'AI model', exact: true }).click();
  await page.getByRole('menu', { name: 'AI model', exact: true }).locator(`[data-value="${models[index].id}"]`).click();
}
async function send(page, text) {
  const prompt = page.getByRole('textbox', { name: 'Message AI', exact: true });
  await prompt.fill(text); await prompt.press('Enter');
}
async function open(page) {
  const toggle = page.getByRole('button', { name: 'AI chat', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await expect(page.getByRole('textbox', { name: 'Message AI', exact: true })).toBeVisible();
}
async function nativeFixture(world) {
  const source = await readFile('tests/fixtures/browser-runtime-native.mjs');
  const bytes = Buffer.concat([source, Buffer.from('\n//' + ' '.repeat(2208435 - source.length - 3))]);
  const hash = createHash('sha256').update(bytes).digest('hex');
  await world.context.route(/\/lib\/assistant\/browser\/runtime\.ts(?:\?|$)/, route => {
    // Preserve the app's Vite/HMR module identity when observing its runtime.
    runtimeModules.set(route.request().frame().page(), route.request().url());
    return route.continue();
  });
  // Substitute only the executable pin and capability probe, never queue/lease/UI code.
  await world.context.route(/\/lib\/assistant\/browser\/catalog\.json(?:\?|$)/, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replaceAll(BROWSER_PROFILES[0].runtime_source.sha256, hash) });
  });
  await world.context.route(/\/lib\/assistant\/browser\/reference\/compatibility\.js(?:\?|$)/, async route => {
    if (new URL(route.request().url()).searchParams.has('native-fixture')) return route.continue();
    await route.fulfill({ contentType: 'text/javascript', body: `export * from '/lib/assistant/browser/reference/compatibility.js?native-fixture';
      export async function probeBrowser(){return {secure:true,isolated:true,wasm:true,simd:true,threads:true,jspi:true,memory64:true,browser:{name:'Chromium',version:'155'},gpu:{compute:true,f16_compute:true,info:{}}};}` });
  });
  await world.page.reload({ waitUntil: 'networkidle' });
  await world.page.evaluate(async encoded => {
    const { BROWSER_PROFILES, artifactsFor } = await import('/lib/assistant/browser/catalog.ts');
    const { modelDatabase } = await import('/lib/assistant/browser/storage.ts');
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const db = await modelDatabase();
    try {
      for (const profile of BROWSER_PROFILES.slice(0, 3)) {
        const files = artifactsFor(profile), executable = files.find(file => file.id === 'webml-js');
        await db.put('artifacts', { sha256: executable.sha256, bytes: executable.bytes });
        await db.put('blocks', bytes.buffer, [executable.sha256, 0]);
        await db.put('models', { id: profile.id, hashes: files.map(file => file.sha256), installedAt: Date.now() });
      }
    } finally { db.close(); }
  }, bytes.toString('base64'));
  await open(world.page); await choose(world.page, 0);
  try { await expect.poll(() => runtime(world.page)).toBe(models[0].id); }
  catch (error) { throw new Error(`${error.message}\nModel failure: ${await world.page.locator('.model-failure').allTextContents()}\n${JSON.stringify(world.diagnostics)}`); }
}

Then('browser chat switches queued models automatically and preserves request order', { timeout: 60000 }, async function () {
  const page = this.page; await nativeFixture(this);
  await send(page, 'first prompt'); await expect.poll(async () => (await turns(page)).length).toBe(1);
  await expect(page.getByRole('button', { name: 'AI model', exact: true })).toBeEnabled();
  await expect(page.getByRole('textbox', { name: 'Message AI', exact: true })).toBeEditable();
  await choose(page, 1); await send(page, 'second prompt');
  await expect(page.getByRole('article', { name: 'Queued prompt', exact: true })).toContainText(models[1].title);
  await choose(page, 2); await send(page, 'cancel this prompt');
  await expect(page.getByRole('article', { name: 'Queued prompt', exact: true })).toHaveCount(2);
  await page.getByRole('article', { name: 'Queued prompt', exact: true }).filter({ hasText: 'cancel this prompt' }).getByRole('button', { name: 'Cancel queued prompt', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message AI', exact: true }).fill('Keep this draft.');
  assert.equal((await turns(page)).length, 1);
  await finish(page); await expect.poll(async () => (await turns(page)).length).toBe(2);
  const second = (await turns(page))[1]; assert.equal(second.file, models[1].file);
  const history = second.messages.filter(item => item.role !== 'system');
  assert.deepEqual(history.map(item => item.role), ['user', 'assistant', 'user']);
  assert.match(history[1].content, /first prompt/); assert.equal(history.at(-1).content, 'second prompt');
  const events = await page.evaluate(() => globalThis.browserRuntimeFixture.events);
  assert.ok(events.findIndex(item => item.event === 'finish' && item.file === models[0].file) < events.findIndex(item => item.event === 'unload' && item.file === models[0].file));
  assert.ok(events.findIndex(item => item.event === 'unload' && item.file === models[0].file) < events.findIndex(item => item.event === 'load' && item.file === models[1].file));
  await finish(page); await expect.poll(() => runtime(page)).toBe(models[2].id);
  await expect(page.getByRole('article', { name: 'Queued prompt', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message AI', exact: true })).toHaveText('Keep this draft.');
  assert.equal((await turns(page)).length, 2);
  await expect(page.locator('.model-failure')).toHaveCount(0);
});

Then('closing a waiting browser conversation cancels its prompts and model load', { timeout: 60000 }, async function () {
  const page = this.page; await nativeFixture(this);
  await send(page, 'finish the original'); await expect.poll(async () => (await turns(page)).length).toBe(1);
  await page.getByRole('button', { name: 'New chat', exact: true }).click(); await choose(page, 1);
  await send(page, 'this closed chat must never run');
  await expect(page.getByRole('article', { name: 'Queued prompt', exact: true })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Session 2', exact: true }).press('Delete');
  await expect(page.getByRole('tab', { name: 'Session 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop generating', exact: true })).toHaveCount(0);
  await expect.poll(async () => page.evaluate(async url => (await import(url)).runtimeBusy(), runtimeModules.get(page))).toBe(false);
  assert.equal((await turns(page)).length, 1);
  assert.equal((await page.evaluate(() => globalThis.browserRuntimeFixture.events)).filter(item => item.event === 'load').length, 1);
  await choose(page, 1); await expect.poll(() => runtime(page)).toBe(models[1].id);
  await send(page, 'queue recovered after stop'); await expect.poll(async () => (await turns(page)).length).toBe(2);
  await finish(page); // Discard the stopped fixture's already rejected gate.
  await finish(page);
  await expect(page.getByRole('img', { name: 'AI completion', exact: true })).toBeVisible();
});

Then('browser runtime ownership waits for active replies and releases idle models across tabs', { timeout: 60000 }, async function () {
  const page = this.page; await nativeFixture(this);
  await send(page, 'first tab reply'); await expect.poll(async () => (await turns(page)).length).toBe(1);
  const other = await this.context.newPage();
  try {
    await other.goto(page.url(), { waitUntil: 'networkidle' }); await open(other); await choose(other, 1);
    await expect(other.locator('.model-loading')).toContainText('Waiting for browser runtime');
    await send(other, 'second tab reply');
    await expect(other.getByRole('article', { name: 'Queued prompt', exact: true })).toHaveCount(1);
    assert.equal(await runtime(page), models[0].id); assert.equal(await runtime(other), undefined);
    await finish(page); await expect.poll(async () => (await turns(other)).length).toBe(1);
    assert.equal(await runtime(page), undefined); assert.equal(await runtime(other), models[1].id);
    await finish(other); await expect(other.getByRole('img', { name: 'AI completion', exact: true })).toBeVisible();
    await choose(page, 0); await expect.poll(() => runtime(page)).toBe(models[0].id);
    assert.equal(await runtime(other), undefined);
    const locks = await page.evaluate(async () => (await navigator.locks.query()).held.filter(lock => lock.name === 'code-browser-model-runtime'));
    assert.equal(locks.length, 1);
    await expect(page.locator('.model-failure')).toHaveCount(0); await expect(other.locator('.model-failure')).toHaveCount(0);
  } finally { await other.close(); }
});

Then('browser runtime modules in one tab release their models before switching', { timeout: 60000 }, async function () {
  const page = this.page; await nativeFixture(this);
  const originalURL = runtimeModules.get(page);
  const replacementURL = new URL(originalURL); replacementURL.searchParams.set('runtime-fixture', 'replacement');
  await page.evaluate(async ({ url, id }) => {
    const replacement = await import(url);
    await replacement.loadBrowserModel(id, () => {}, AbortSignal.timeout(10000));
  }, { url: replacementURL.href, id: models[1].id });
  assert.equal(await page.evaluate(async url => (await import(url)).loadedModel(), originalURL), undefined);
  assert.equal(await page.evaluate(async url => (await import(url)).loadedModel(), replacementURL.href), models[1].id);
  // Select through the original UI again, handing ownership back without reloading.
  runtimeModules.set(page, originalURL);
  await choose(page, 2); await expect.poll(() => runtime(page)).toBe(models[2].id);
  assert.equal(await page.evaluate(async url => (await import(url)).loadedModel(), replacementURL.href), undefined);
  await expect(page.locator('.model-failure')).toHaveCount(0);
});
