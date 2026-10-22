// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import InstallWorker from './install.worker.ts?worker&inline';
import type { Progress } from './types.ts';
export function installBrowserModel(id: string, onProgress: (event: Progress) => void, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const worker = new InstallWorker();
  return new Promise((resolve, reject) => {
    // Let the worker abort its range request and discard incomplete data first.
    const abort = () => worker.postMessage({ action: 'cancel' });
    const finish = (error?: Error) => { signal.removeEventListener('abort', abort); worker.terminate(); error ? reject(error) : resolve(); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => finish(new Error('Browser model installation worker failed. Try again.'));
    worker.onmessage = (event: MessageEvent<{ progress?: Progress; error?: string; done?: boolean }>) => {
      if (event.data.progress) onProgress(event.data.progress);
      if (event.data.error) finish(new Error(event.data.error));
      else if (event.data.done) finish();
    };
    worker.postMessage({ action: 'install', id, baseURL: document.baseURI });
  });
}
