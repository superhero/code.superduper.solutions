// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { createSHA256 } from 'hash-wasm';
import { downloadPackage } from '../../packages/download';
import { speechArtifacts, speechModes } from './catalog';
import type { SpeechArtifact, SpeechMode, SpeechProgress } from './types';

const CACHE = 'code-speech-artifacts-v1';
const key = (file: SpeechArtifact) => new URL(`/__code_speech__/${file.sha256}`, location.origin).href;
const mime = (file: SpeechArtifact) => ['js', 'mjs'].includes(file.type) ? 'text/javascript' : file.type === 'wasm' ? 'application/wasm' : 'application/octet-stream';
export async function installedSpeech(): Promise<SpeechMode[]> {
  const cache = await caches.open(CACHE), found: SpeechMode[] = [];
  for (const mode of speechModes) {
    const files = speechArtifacts(mode.id);
    if ((await Promise.all(files.map(async file => (await cache.match(key(file)))?.headers.get('x-code-sha256') === file.sha256))).every(Boolean)) found.push(mode.id);
  }
  return found;
}
/** Verify a bounded stream while CacheStorage writes it; no multi-GB JS buffer. */
export async function cacheSpeechArtifact(cache: Cache, file: SpeechArtifact, progress: (bytes: number) => void,
  signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<void> {
  signal.throwIfAborted();
  if ((await cache.match(key(file)))?.headers.get('x-code-sha256') === file.sha256) { progress(file.bytes); return; }
  const hash = await createSHA256(); hash.init(); let received = 0, verificationError: Error | undefined;
  let response: Response;
  if (file.parts) {
    const bytes = await downloadPackage(file, location.href, progress, signal, fetcher);
    response = new Response(bytes);
  } else response = await fetcher(new URL(file.url, location.href), { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  if (!response.ok || !response.body) throw new Error(`Could not download ${file.id}.`);
  const stream = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      signal.throwIfAborted(); received += bytes.length;
      if (received > file.bytes) { verificationError = new Error(`Unexpected size for ${file.id}.`); throw verificationError; }
      hash.update(bytes); progress(received); controller.enqueue(bytes);
    },
    flush() {
      signal.throwIfAborted();
      if (received !== file.bytes || hash.digest('hex') !== file.sha256) { verificationError = new Error(`Verification failed for ${file.id}. Retry the download.`); throw verificationError; }
    },
  }));
  try {
    await cache.put(key(file), new Response(stream, { headers: { 'Content-Type': mime(file), 'Content-Length': String(file.bytes), 'x-code-sha256': file.sha256 } }));
    signal.throwIfAborted();
  } catch (error) {
    await stream.cancel().catch(() => {});
    await cache.delete(key(file));
    const failure = verificationError ?? error;
    if (failure instanceof DOMException && failure.name === 'QuotaExceededError')
      throw new Error('The browser ran out of storage while saving this speech model. Remove an unused model and try again.', { cause: failure });
    throw failure;
  }
}
export async function installSpeech(mode: SpeechMode, progress: (event: SpeechProgress) => void, signal: AbortSignal): Promise<void> {
  if (!navigator.locks) throw new Error('Speech storage requires a secure browser with Web Locks.');
  await navigator.locks.request('code-speech-install', { signal }, async () => {
    const cache = await caches.open(CACHE), files = speechArtifacts(mode);
    // Privacy protections can mask quota estimates. Actual writes determine capacity.
    let received = 0; const total = files.reduce((sum, file) => sum + file.bytes, 0);
    for (const file of files) {
      await cacheSpeechArtifact(cache, file, bytes => progress({ file: file.id, received: received + bytes, total }), signal);
      received += file.bytes;
    }
  });
}
/** Restoring a complete cache never falls back to a network download. */
export async function cachedSpeechURLs(mode: SpeechMode, signal: AbortSignal): Promise<{ urls: Record<string, string>; close(): void }> {
  const cache = await caches.open(CACHE), urls: Record<string, string> = {};
  const close = () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  try {
    for (const file of speechArtifacts(mode)) {
      signal.throwIfAborted();
      const response = await cache.match(key(file));
      if (response?.headers.get('x-code-sha256') !== file.sha256) throw new Error('The speech cache is incomplete. Install the model again.');
      urls[file.id] = URL.createObjectURL(await response.blob());
    }
    signal.throwIfAborted(); return { urls, close };
  } catch (error) { close(); throw error; }
}
export async function removeSpeech(mode: SpeechMode): Promise<void> {
  await navigator.locks.request('code-speech-install', async () => {
    const cache = await caches.open(CACHE);
    const retained = new Set((await installedSpeech()).filter(id => id !== mode).flatMap(id => speechArtifacts(id).map(file => file.sha256)));
    for (const file of speechArtifacts(mode)) if (!retained.has(file.sha256)) await cache.delete(key(file));
  });
}
