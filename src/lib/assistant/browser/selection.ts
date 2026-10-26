// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { installedModels } from './storage.ts';
import { loadBrowserModel } from './runtime.ts';
import type { Progress } from './types.ts';

const browser = { installedModels, loadBrowserModel,
  async installBrowserModel(id: string, progress: (value: Progress) => void, signal: AbortSignal) {
    const { installBrowserModel } = await import('./installer.ts');
    await installBrowserModel(id, progress, signal);
  },
};
/** An explicit model choice installs missing artifacts before loading them. */
export async function prepareBrowserModel(id: string, progress: (value: Progress) => void, signal: AbortSignal,
  context?: number, adapters = browser): Promise<void> {
  await ensureBrowserModelInstalled(id, progress, signal, adapters);
  await adapters.loadBrowserModel(id, progress, signal, context);
}
export async function ensureBrowserModelInstalled(id: string, progress: (value: Progress) => void, signal: AbortSignal,
  adapters = browser): Promise<void> {
  signal.throwIfAborted();
  if (!(await adapters.installedModels()).includes(id)) await adapters.installBrowserModel(id, progress, signal);
  signal.throwIfAborted();
}
