// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import pins from './catalog.json' with { type: 'json' };
import notices from './notices.json' with { type: 'json' };
import type { Artifact, BrowserProfile } from './types.ts';
export const BROWSER_PROFILES = pins as unknown as readonly BrowserProfile[];
const wllama = [
  { id: 'wllama-js', url: 'browser-models/wllama/index.js', bytes: 386851, sha256: '0df764726d349c47085ac79703557b45e8c8411a09ed4f5ad7e439571c611b2f', kind: 'runtime' },
  { id: 'wllama-wasm', url: 'browser-models/wllama/wllama.wasm', bytes: 9324918, sha256: '68d7d381d505da43b890912552870ec6db54ce18862ce695c6f80cff142c395f', kind: 'runtime' },
  { id: 'wllama-license', url: 'browser-models/wllama/LICENCE', bytes: 1071, sha256: '5866e3bd7e3cbd3f7c8bea6efd8a1e7fa7cc8de68c30f428aff7c6584a0fb720', kind: 'notice' },
] satisfies Artifact[];
// Filled from the pinned source-build receipt; never substitute npm Wllama.
export function profileById(id: string): BrowserProfile {
  const profile = BROWSER_PROFILES.find(item => item.id === id);
  if (!profile) throw new Error('Unknown browser model.');
  return profile;
}
export const weightURL = (model: string, revision: string, file: string) => `https://huggingface.co/${model}/resolve/${revision}/${file}`;
export function artifactsFor(profile: BrowserProfile): Artifact[] {
  const source = profile.runtime_source;
  return [
    { id: profile.file, url: weightURL(profile.model, profile.revision, profile.file), bytes: profile.weight_bytes, sha256: profile.weight_sha256, kind: 'weights' },
    { id: profile.projector.file, url: weightURL(profile.projector.model, profile.projector.revision, profile.projector.file), bytes: profile.projector.bytes, sha256: profile.projector.sha256, kind: 'weights' },
    ...(profile.engine === 'webml' ? [{ id: 'webml-js', url: `https://huggingface.co/spaces/${source.repository}/resolve/${source.revision}/${source.file}`, bytes: 2208435, sha256: source.sha256!, kind: 'runtime' as const }] : wllama),
    ...notices.filter(notice => notice.family === (profile.engine === 'webml' ? 'bonsai' : 'ornith')).map(notice => ({ id: notice.file, url: `browser-models/notices/${notice.file}`, bytes: notice.bytes, sha256: notice.sha256, kind: 'notice' as const })),
  ];
}
export const downloadBytes = (profile: BrowserProfile) => artifactsFor(profile).reduce((sum, file) => sum + file.bytes, 0);
