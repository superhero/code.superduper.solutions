// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { deleteDB } from 'idb';

/** Remove the obsolete recording archive without opening or recreating it. */
export async function clearLegacySpeechDiagnostics(): Promise<void> {
  if (typeof indexedDB !== 'undefined') await deleteDB('code-speech-diagnostics');
}
