// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { DEFAULT_SETTINGS, normalizeOverrides, type EditorSettings } from '../editor/settings.ts';
import { toolResultText } from './tools.ts';

export interface SettingsToolContext {
  personal: EditorSettings;
  effective: EditorSettings;
  repository?: { id: string; overrides: Partial<EditorSettings> };
}
/** Capture only recognized editor preferences; no vault, profiles or other repositories. */
export function settingsTools(context: SettingsToolContext | undefined, enabled = true): AgentTool[] {
  if (!context || !enabled) return [];
  const snapshot = structuredClone({ personal: normalizeOverrides(context.personal), effective: normalizeOverrides(context.effective),
    repository: context.repository ? { id: context.repository.id, overrides: normalizeOverrides(context.repository.overrides) } : undefined });
  return [{ name: 'read_settings', label: 'Read settings',
    description: 'Read editor preferences captured when the user sent this message. With no keys, list available setting names. Provide up to 16 keys to read values. scope is effective (default), personal, or repository (explicit overrides only). Effective values include their personal/repository source. No vault values, connection credentials, other repositories or file overrides are exposed. Output may be truncated for large settings; request fewer keys.',
    parameters: Type.Object({ scope: Type.Optional(Type.Union([Type.Literal('effective'), Type.Literal('personal'), Type.Literal('repository')])),
      keys: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { minItems: 1, maxItems: 16, uniqueItems: true })) }, { additionalProperties: false }),
    execute: async (_id, args, signal) => {
      signal?.throwIfAborted();
      const { scope = 'effective', keys } = args as { scope?: 'effective' | 'personal' | 'repository'; keys?: string[] };
      const values = scope === 'personal' ? snapshot.personal : scope === 'repository' ? snapshot.repository?.overrides : snapshot.effective;
      const output = (value: unknown) => ({ content: [{ type: 'text' as const, text: toolResultText(JSON.stringify(value)) }], details: {} });
      if (!values) return output({ scope, available: false, reason: 'No repository selected.' });
      if (!keys) return output({ scope, repositoryId: snapshot.repository?.id, keys: Object.keys(values).sort() });
      if (keys.some(key => !Object.hasOwn(DEFAULT_SETTINGS, key))) throw new Error('Unknown editor setting. Call read_settings without keys to list available names.');
      return output({ scope, repositoryId: snapshot.repository?.id,
        values: Object.fromEntries(keys.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key as keyof EditorSettings]])),
        ...(scope === 'effective' ? { sources: Object.fromEntries(keys.map(key => [key, snapshot.repository && Object.hasOwn(snapshot.repository.overrides, key) ? 'repository' : 'personal'])) } : {}),
        ...(scope === 'repository' ? { inherited: keys.filter(key => !Object.hasOwn(values, key)) } : {}) });
    } }];
}
