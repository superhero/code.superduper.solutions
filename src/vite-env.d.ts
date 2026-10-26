// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/// <reference types="svelte" />
/// <reference types="vite/client" />
declare module 'virtual:code-speech' {
  const catalog: import('./lib/assistant/speech/types').SpeechArtifact[];
  export default catalog;
}
