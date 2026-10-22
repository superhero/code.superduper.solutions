// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const expected = {
  'index.js': '0df764726d349c47085ac79703557b45e8c8411a09ed4f5ad7e439571c611b2f',
  'wllama.wasm': '68d7d381d505da43b890912552870ec6db54ce18862ce695c6f80cff142c395f',
  'LICENCE': '5866e3bd7e3cbd3f7c8bea6efd8a1e7fa7cc8de68c30f428aff7c6584a0fb720',
};
export async function verifyBrowserRuntime() {
  const root = new URL('../src/public/browser-models/wllama/', import.meta.url);
  const receipt = JSON.parse(await readFile(new URL('build-receipt.json', root), 'utf8'));
  if (receipt.wllama !== '3bb2a46f0dab0b924e8cd992b85e8881c3d3a859' || receipt.llama_cpp !== '970b51ce7c9ba5fff0726c5e9994f1c2f0e4eedc' || receipt.cpu_heap_max_gib !== 4)
    throw new Error('The browser Wllama source-build pin changed. Review its evidence before updating.');
  const notices = JSON.parse(await readFile(new URL('../src/lib/assistant/browser/notices.json', import.meta.url), 'utf8'));
  for (const notice of notices) {
    const bytes = await readFile(new URL('../src/public/browser-models/notices/' + notice.file, import.meta.url));
    if (bytes.length !== notice.bytes || createHash('sha256').update(bytes).digest('hex') !== notice.sha256)
      throw new Error('Browser model publisher notice changed: ' + notice.file);
  }
  for (const [name, hash] of Object.entries(expected)) {
    const bytes = await readFile(new URL(name, root));
    if (createHash('sha256').update(bytes).digest('hex') !== hash || receipt.files[name] !== hash)
      throw new Error(`Browser inference artifact differs from its reviewed source build: ${name}`);
  }
}
export function browserModels() { return { name: 'code-browser-model-runtime-pins', buildStart: verifyBrowserRuntime }; }
