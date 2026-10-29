// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {openDB} from 'idb';
const BLOCK = 8 * 1024 * 1024;
const nativeFetch = globalThis.fetch.bind(globalThis);
/** Installed files only. Optional Transformers metadata probes receive a local 404. */
export function useInstalledAssets({files, runtimeURLs, fileURLs}) {
  const byURL = new Map(files.map(file => [new URL(file.url).href, file]));
  const blobs = new Set(Object.values(runtimeURLs));
  globalThis.__codeRuntimeURL = name => {
    const url = runtimeURLs[name];
    if (!url) throw Error('Unpinned runtime asset: ' + name);
    return url;
  };
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input));
    if (blobs.has(url.href) || /^data:image\/(?:png|jpeg|webp);base64,/.test(url.href)) return nativeFetch(input, init);
    url.search = ''; url.hash = '';
    const file = byURL.get(url.href);
    if (file && fileURLs?.[file.id]) return nativeFetch(fileURLs[file.id], init);
    if (!file) return new Response('File is not in the installed model.', {status: 404});
    const db = await openDB('code-browser-models', 1);
    if (!(await db.get('artifacts', file.sha256))) {db.close(); throw Error('Installed model file is incomplete. Reinstall the model.');}
    db.close();
    const range = new Headers(init.headers ?? request?.headers).get('range')?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) + 1 : file.bytes;
    if (start < 0 || end > file.bytes || end <= start) return new Response(null, {status: 416});
    const headers = {'content-length': String(end - start), 'accept-ranges': 'bytes', 'content-type': file.id.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      ...(range ? {'content-range': `bytes ${start}-${end - 1}/${file.bytes}`} : {})};
    if ((init.method ?? request?.method) === 'HEAD') return new Response(null, {headers});
    let offset = start;
    return new Response(new ReadableStream({async pull(controller) {
      let reader;
      try {
        init.signal?.throwIfAborted();
        if (offset === end) {controller.close(); return;}
        reader = await openDB('code-browser-models', 1);
        const block = await reader.get('blocks', [file.sha256, Math.floor(offset / BLOCK)]);
        if (!block) throw Error('Installed model data is truncated.');
        const at = offset % BLOCK, length = Math.min(end - offset, block.byteLength - at);
        if (length <= 0) throw Error('Installed model data is truncated.');
        controller.enqueue(new Uint8Array(block.slice(at, at + length))); offset += length;
      } catch (error) {controller.error(error);}
      finally {reader?.close();}
    }}), {status: range ? 206 : 200, headers});
  };
}
