// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Then } from '@cucumber/cucumber';
import { downloadPackage } from './download.ts';
import { publishPackageArtifact, packagePartBytes } from '../../../build/package-artifacts.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const base = 'https://editor.example/';
const sample = () => ({ bytes: 4, url: './a', parts: [
  { url: './a', bytes: 2, sha256: hash(Buffer.from('ab')) },
  { url: './b', bytes: 2, sha256: hash(Buffer.from('cd')) },
] });
Then('a single optional package downloads with bounded progress', async function () {
  const progress = [], requests = [];
  const bytes = await downloadPackage({ url: './sample', bytes: 4 }, base, n => progress.push(n), undefined,
    async (url, options) => { requests.push([url.href, options.credentials]); return new Response('abcd'); });
  assert.equal(Buffer.from(bytes).toString(), 'abcd');
  assert.deepEqual(progress, [4]); assert.deepEqual(requests, [[base + 'sample', 'omit']]);
});
Then('a large optional package is split and reassembled without changing its checksum', async function () {
  const original = Buffer.alloc(packagePartBytes * 2 + 7, 91), assets = new Map();
  const transport = publishPackageArtifact(assets, 'test.formatter.json', original);
  assert.equal(transport.parts.length, 3);
  assert.ok([...assets.values()].every(bytes => bytes.length <= packagePartBytes));
  const progress = [], requests = [];
  const bytes = await downloadPackage({ ...transport, bytes: original.length }, base, n => progress.push(n), undefined,
    async (url, options) => { requests.push(url.pathname); assert.equal(options.credentials, 'omit'); return new Response(assets.get(url.pathname.slice(1))); });
  assert.equal(hash(Buffer.from(bytes)), hash(original));
  assert.deepEqual(requests, transport.parts.map(part => '/' + part.url.slice(2)));
  assert.equal(progress.at(-1), original.length);
  assert.ok(progress.every((n, i) => i === 0 || n > progress[i - 1]));
  const small = new Map();
  assert.deepEqual(publishPackageArtifact(small, 'small.json', Buffer.from('ok')), { url: './small.json' });
  assert.equal(small.get('small.json').toString(), 'ok');
});
Then('the optional package downloader rejects a {string} response', async function (failure) {
  const replies = { missing: () => new Response('', { status: 404 }), truncated: () => new Response('a'),
    oversized: () => new Response('abc'), corrupt: () => new Response('xy') };
  let requests = 0;
  await assert.rejects(downloadPackage(sample(), base, () => {}, undefined,
    async () => { requests++; return replies[failure](); }), /download|checksum/);
  assert.equal(requests, 1);
});
Then('cancelling an optional package download cancels its reader and stops subsequent parts', async function () {
  const controller = new AbortController(); let requests = 0, cancelled = false;
  await assert.rejects(downloadPackage(sample(), base, () => controller.abort(), controller.signal, async () => {
    requests++;
    return new Response(new ReadableStream({ start(stream) { stream.enqueue(new TextEncoder().encode('a')); }, cancel() { cancelled = true; } }));
  }), error => error.name === 'AbortError');
  assert.equal(requests, 1); assert.equal(cancelled, true);
});
Then('the optional package downloader rejects {string} metadata without fetching', async function (failure) {
  const item = sample();
  if (failure === 'empty parts') item.parts = [];
  else if (failure === 'incorrect total') item.bytes++;
  else item.parts[0].bytes = NaN;
  let requests = 0;
  await assert.rejects(downloadPackage(item, base, () => {}, undefined, async () => { requests++; return new Response('ab'); }), /metadata/);
  assert.equal(requests, 0);
});
