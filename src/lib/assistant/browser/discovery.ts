// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { installedModels, readModelSettings } from './storage.ts';
import { profileById } from './catalog.ts';
import { defaultSettings } from './reference/settings.js';
import type { OllamaModel } from '../ollama.ts';
export async function discoverBrowserModels(): Promise<OllamaModel[]> {
  return Promise.all((await installedModels()).map(async id => {
    const profile = profileById(id), saved = await readModelSettings(id);
    const settings = defaultSettings(profile, saved.generation as Record<string, unknown> | undefined);
    return { id, label: profile.title, contextWindow: Number(settings.context_tokens) };
  }));
}
