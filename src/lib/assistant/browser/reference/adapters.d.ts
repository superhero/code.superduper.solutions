// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Artifact, BrowserProfile, BrowserFacts, BrowserOptions, LocalEngine, LocalStream, Progress } from '../types.ts';
export const localStream: LocalStream;
export function loadEngine(profile: BrowserProfile, progress: (event: Progress) => void, options: BrowserOptions & {
  capabilities: BrowserFacts; webmlModule?: unknown; wasmUrl?: string; Wllama?: unknown;
  localFetch: typeof fetch; files: Artifact[]; readArtifact(file: Artifact, start?: number, end?: number): Promise<ArrayBuffer>; signal: AbortSignal;
}): Promise<LocalEngine>;
