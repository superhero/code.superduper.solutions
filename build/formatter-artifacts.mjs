// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
const pins = JSON.parse(await readFile(new URL('./formatter-artifacts.json', import.meta.url), 'utf8'));
export async function formatterArtifact(plugin) {
  const pin = pins.find(item => item.plugin === plugin);
  if (!pin) throw new Error(`Unpinned formatter artifact: ${plugin}`);
  const path = new URL(`../tmp/formatter-artifacts/${pin.sha256}.wasm`, import.meta.url);
  let bytes, downloaded = false;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    downloaded = true;
    const response = await fetch(pin.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw new Error(`Cannot download pinned formatter ${plugin}: HTTP ${response.status}`);
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > pin.bytes) throw new Error(`Formatter ${plugin} exceeded its pinned size.`);
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length !== pin.bytes || createHash('sha256').update(bytes).digest('hex') !== pin.sha256) throw new Error(`Formatter ${plugin} does not match its pinned checksum.`);
  if (!downloaded) return { bytes, metadata: { name: plugin, version: pin.version, license: 'See embedded notices', source: pin.url } };
  await mkdir(new URL('../tmp/formatter-artifacts/', import.meta.url), { recursive: true });
  const temporary = new URL(`../tmp/formatter-artifacts/${randomUUID()}.tmp`, import.meta.url);
  await writeFile(temporary, bytes); await rename(temporary, path);
  return { bytes, metadata: { name: plugin, version: pin.version, license: 'See embedded notices', source: pin.url } };
}
