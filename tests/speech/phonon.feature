# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Phonon GPU streaming
  Scenario: Native GPU transcription awaits JSPI before freeing its input
    Then Phonon awaits asynchronous native recognition and releases the WAV afterwards
  Scenario: Window timestamps remain in the session timeline
    Then Phonon offsets native word times and rejects stale inference callbacks
  Scenario: Coalescing preserves PCM and confirmed text
    Then Phonon serially drains coalesced speech without rewriting confirmed text
  Scenario: Silence skips native GPU inference
    Then silent Phonon capture finishes without native recognition
  Scenario: GPU prerequisites and packed model continuity are explicit
    Then Phonon rejects missing JSPI and buffer capacity while retaining the same GGUF
  Scenario: Stop flushes capture before finalization
    Then Phonon flushes PCM and preserves stable words through Stop
  Scenario: Installed GPU speech retains its speech-detector notices
    Then Phonon includes the pinned TEN-VAD license and notices in its offline install
