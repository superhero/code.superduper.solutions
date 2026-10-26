// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { installedModels, readModelSettings } from './storage.ts';
import { BROWSER_PROFILES, profileById } from './catalog.ts';
import { defaultSettings } from './settings.js';
import type { OllamaModel } from '../ollama.ts';
export async function discoverBrowserModels(engine?: 'webml' | 'wllama' | 'litert-lm'): Promise<OllamaModel[]> {
  const profiles = (await installedModels()).map(profileById).filter(profile => (!profile.category || profile.category === 'llm') && (!engine || profile.engine === engine));
  return Promise.all(profiles.map(async profile => {
    const id = profile.id, saved = await readModelSettings(id);
    const settings = defaultSettings(profile, saved.generation as Record<string, unknown> | undefined);
    return { id, label: profile.title, contextWindow: Number(settings.context_tokens) };
  }));
}
export async function browserModelCatalog(): Promise<OllamaModel[]> {
  return Promise.all(BROWSER_PROFILES.map(async profile => {
    const saved = await readModelSettings(profile.id);
    const settings = defaultSettings(profile, saved.generation as Record<string, unknown> | undefined);
    return { id: profile.id, label: profile.title, contextWindow: Number(settings.context_tokens) };
  }));
}
