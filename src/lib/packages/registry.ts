// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { openDB, type DBSchema } from 'idb';
import { validatePackage, type FormatterPackage, type PackageEnvelope } from '../formatting/packages.ts';
export function createPackageEvents(databaseName:string){
  const listeners=new Set<()=>void>();let channel:BroadcastChannel|undefined;
  function publish(){for(const listener of listeners)listener();channel?.postMessage('changed');}
  function subscribe(listener:()=>void){
    if(typeof BroadcastChannel!=='undefined'&&!channel){channel=new BroadcastChannel(databaseName);channel.onmessage=()=>{for(const subscriber of listeners)subscriber();};}
    listeners.add(listener);
    return()=>{listeners.delete(listener);if(!listeners.size){channel?.close();channel=undefined;}};
  }
  return{publish,subscribe};
}
export function createPackageRegistry(catalog: readonly FormatterPackage[], databaseName: string, settingsLocation = 'Settings → Packages') {
  interface InstalledPackage { id: string; version: string; sha256: string; bytes: ArrayBuffer; installedAt: number }
  interface LanguageDB extends DBSchema { packages: { key: string; value: InstalledPackage; indexes: { metadata: [string,string,string] } } }
  const database = () => openDB<LanguageDB>(databaseName, 2, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) db.createObjectStore('packages', { keyPath: 'id' });
      if (oldVersion < 2) transaction.objectStore('packages').createIndex('metadata', ['id','version','sha256']);
    },
    blocking(_current, _blocked, event) { (event.target as IDBDatabase).close(); },
  });
  const {publish,subscribe}=createPackageEvents(databaseName);
  async function installedPackages(): Promise<{ id: string; version: string; sha256: string }[]> {
    const db = await database();
    try {
      // Read index keys only: listing installations must not clone large Wasm payloads.
      const result: { id: string; version: string; sha256: string }[] = [];
      let cursor = await db.transaction('packages').store.index('metadata').openKeyCursor();
      while (cursor) { const [id, version, sha256] = cursor.key; result.push({ id, version, sha256 }); cursor = await cursor.continue(); }
      return result;
    } finally { db.close(); }
  }
  async function readPackage(item: FormatterPackage): Promise<{ bytes: ArrayBuffer; envelope: PackageEnvelope }> {
    const db = await database();
    let installed;
    try { installed = await db.get('packages', item.id); } finally { db.close(); }
    if (!installed) throw new Error(`Install ${item.name} from ${settingsLocation} before using this support.`);
    if (installed.sha256 !== item.sha256) throw new Error(`Update ${item.name} in ${settingsLocation} for this application version.`);
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
  async function importPackage(bytes: ArrayBuffer): Promise<void> {
    if (bytes.byteLength > Math.max(...catalog.map(item => item.bytes))) throw new Error('This file is larger than any supported optional support package.');
    // Only an exact, trusted catalog artifact can be imported, never arbitrary code.
    let envelope: { id?: unknown };
    try { envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new Error('This file is not a supported optional support package JSON file.'); }
    const item = catalog.find(item => item.id === envelope?.id);
    if (!item) throw new Error('This optional support package is not supported by this application version.');
    await storePackage(bytes, item);
  }
  async function installPackage(item: FormatterPackage, onprogress: (received: number) => void,
    signal?: AbortSignal): Promise<void> {
    if (!catalog.some(known => known.id === item.id && known.sha256 === item.sha256)) throw new Error('Unknown optional support package.');
    if (location.protocol === 'file:') throw new Error('Use Import package when opening the application from a local HTML file.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('The optional support download timed out. Try again.')), 120_000);
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const response = await fetch(new URL(item.url, document.baseURI), { credentials: 'omit', signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('The optional support could not be downloaded. Try again online, or import its package file.');
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > item.bytes) { await reader.cancel(); throw new Error('The optional support download exceeded its expected size.'); }
        chunks.push(value); onprogress(received);
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      if (controller.signal.aborted) throw controller.signal.reason;
      await storePackage(bytes.buffer, item, controller.signal);
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  }
  async function removePackage(id: string): Promise<void> {
    const db = await database();
    try { await db.delete('packages', id); } finally { db.close(); }
    publish();
  }

  return { catalog, installedPackages, readPackage, subscribe, importPackage, installPackage, removePackage };

}
