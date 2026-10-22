// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { installModel, subscribeModels } from './storage.ts';
const controller = new AbortController();
self.onmessage = (event: MessageEvent<{ action: 'install' | 'cancel'; id: string; baseURL: string }>) => {
  if (event.data.action === 'cancel') { controller.abort(); return; }
  const unsubscribe = subscribeModels(() => {});
  let lastProgress = -Infinity;
  void installModel(event.data.id, progress => {
    const now = performance.now();
    if (now - lastProgress >= 100 || progress.received === progress.total) { lastProgress = now; self.postMessage({ progress }); }
  }, controller.signal, event.data.baseURL).then(
    () => self.postMessage({ done: true }),
    error => self.postMessage({ error: error instanceof Error ? error.message : 'Installation failed.' }),
  ).finally(unsubscribe);
};
