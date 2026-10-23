// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { FormatterPackage } from '../formatting/packages.ts';

/** Reassemble trusted static parts before the normal complete-package validation. */
export async function downloadPackage(item: Pick<FormatterPackage, 'url' | 'bytes' | 'parts'>,
  baseURL: string, onprogress: (received: number) => void, signal?: AbortSignal,
  fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  const parts = item.parts ?? [{ url: item.url, bytes: item.bytes }];
  if (!Number.isSafeInteger(item.bytes) || item.bytes <= 0 || !parts.length
    || parts.some(part => !Number.isSafeInteger(part.bytes) || part.bytes <= 0)
    || parts.reduce((total, part) => total + part.bytes, 0) !== item.bytes) {
    throw new Error('The package download metadata is invalid.');
  }
  signal?.throwIfAborted();
  const bytes = new Uint8Array(item.bytes);
  let received = 0;
  for (const part of parts) {
    signal?.throwIfAborted();
    const response = await fetcher(new URL(part.url, baseURL), { credentials: 'omit', signal: signal ?? null });
    if (!response.ok || !response.body) throw new Error('The package could not be downloaded. Try again online.');
    const reader = response.body.getReader(), start = received;
    let complete = false;
    try {
      while (true) {
        signal?.throwIfAborted();
        const { done, value } = await reader.read();
        signal?.throwIfAborted();
        if (done) { complete = true; break; }
        if (received - start + value.byteLength > part.bytes) throw new Error('The package download exceeded its expected size.');
        bytes.set(value, received); received += value.byteLength; onprogress(received);
      }
    } finally {
      if (!complete) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (received - start !== part.bytes) throw new Error('The package download size does not match this application version.');
    if ('sha256' in part) {
      const digest = await crypto.subtle.digest('SHA-256', bytes.subarray(start, received));
      const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
      if (hash !== part.sha256) throw new Error('The package checksum does not match. Nothing was installed.');
    }
  }
  signal?.throwIfAborted();
  return bytes.buffer;
}
