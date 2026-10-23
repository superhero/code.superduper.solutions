// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { openDB, type DBSchema } from 'idb';
import catalog from 'virtual:formatter-catalog';
import { validatePackage, type FormatterPackage, type PackageEnvelope } from './packages.ts';
import type { FormatterRoute } from './types.ts';
import { downloadPackage } from '../packages/download.ts';
export const formatterPackages: readonly FormatterPackage[] = catalog;
interface InstalledPackage { id: string; version: string; sha256: string; bytes: ArrayBuffer; installedAt: number }
interface FormatterDB extends DBSchema { packages: { key: string; value: InstalledPackage; indexes: { metadata: [string,string,string] } } }
const database = () => openDB<FormatterDB>('code-formatter-packages', 2, {
  upgrade(db, oldVersion, _newVersion, transaction) {
    if (oldVersion < 1) db.createObjectStore('packages', { keyPath: 'id' });
    if (oldVersion < 2) transaction.objectStore('packages').createIndex('metadata', ['id','version','sha256']);
  },
  blocking(_current, _blocked, event) { (event.target as IDBDatabase).close(); },
});
const listeners = new Set<() => void>();
let channel: BroadcastChannel | undefined;
function publish() { for (const listener of listeners) listener(); channel?.postMessage('changed'); }
export function subscribeFormatterPackages(listener: () => void): () => void {
  if (typeof BroadcastChannel !== 'undefined' && !channel) {
    channel = new BroadcastChannel('code-formatter-packages');
    channel.onmessage = () => { for (const subscriber of listeners) subscriber(); };
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); if (!listeners.size) { channel?.close(); channel = undefined; } };
}
export function packageFor(route: FormatterRoute): FormatterPackage {
  const item = formatterPackages.find(item => item.id === (route.engine === "fourmolu" ? "fourmolu" : `${route.engine}-${route.plugin}`));
  if (!item) throw new Error('This formatter is not in the supported catalog.');
  return item;
}
export async function installedPackages(): Promise<{ id: string; version: string; sha256: string }[]> {
  const db = await database();
  try {
    // Read index keys only: listing installations must not clone large Wasm payloads.
    const result: { id: string; version: string; sha256: string }[] = [];
    let cursor = await db.transaction('packages').store.index('metadata').openKeyCursor();
    while (cursor) { const [id, version, sha256] = cursor.key; result.push({ id, version, sha256 }); cursor = await cursor.continue(); }
    return result;
  } finally { db.close(); }
}
export async function readPackage(item: FormatterPackage): Promise<{ bytes: ArrayBuffer; envelope: PackageEnvelope }> {
  const db = await database();
  let installed;
  try { installed = await db.get('packages', item.id); } finally { db.close(); }
  if (!installed) throw new Error(`Install ${item.name} from Settings → Formatters before formatting.`);
  if (installed.sha256 !== item.sha256) throw new Error(`Update ${item.name} in Settings → Formatters for this application version.`);
  return { bytes: installed.bytes, envelope: await validatePackage(installed.bytes, item) };
}
async function storePackage(bytes: ArrayBuffer, item: FormatterPackage, signal?: AbortSignal): Promise<void> {
  await validatePackage(bytes, item);
  if (signal?.aborted) throw signal.reason;
  const db = await database();
  try {
    if (signal?.aborted) throw signal.reason;
    await db.put('packages', { id: item.id, version: item.version, sha256: item.sha256, bytes, installedAt: Date.now() });
  } finally { db.close(); }
  publish();
}
export async function importFormatterPackage(bytes: ArrayBuffer): Promise<void> {
  if (bytes.byteLength > Math.max(...formatterPackages.map(item => item.bytes))) throw new Error('This file is larger than any supported formatter package.');
  // Only an exact, trusted catalog artifact can be imported, never arbitrary code.
  let envelope: { id?: unknown };
  try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('This file is not a supported formatter package JSON file.'); }
  const item = formatterPackages.find(item => item.id === envelope?.id);
  if (!item) throw new Error('This formatter package is not supported by this application version.');
  await storePackage(bytes, item);
}
export async function installFormatter(item: FormatterPackage, onprogress: (received: number) => void,
  signal?: AbortSignal): Promise<void> {
  const known = formatterPackages.find(known => known.id === item.id && known.sha256 === item.sha256);
  if (!known) throw new Error('Unknown formatter package.');
  item = known;
  if (location.protocol === 'file:') throw new Error('Use Import package when opening the application from a local HTML file.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('The formatter download timed out. Try again.')), 120_000);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const bytes = await downloadPackage(item, document.baseURI, onprogress, controller.signal);
    await storePackage(bytes, item, controller.signal);
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}
export async function removeFormatter(id: string): Promise<void> {
  const db = await database();
  try { await db.delete('packages', id); } finally { db.close(); }
  publish();
}
