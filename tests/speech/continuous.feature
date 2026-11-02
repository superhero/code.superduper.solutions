# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Continuous dictation in the editor
  Scenario: Stable deltas append once while provisional words change
    Then continuous speech appends each sequence once and replaces only provisional text
  Scenario: A model handoff waits for speech completion and GPU release
    Then language loading waits for continuous speech to finish and unload
  Scenario: Old callbacks cannot change a restarted conversation
    Then cancelled continuous callbacks cannot write to a later conversation
  Scenario: Delayed microphone denial cannot destroy the replacement worker
    Then a late continuous permission failure preserves a freshly loaded worker
  Scenario: VAD choices disclose unsupported and delayed detection paths
    Then continuous speech offers only verified VAD models with explicit placement and delay
  Scenario: GPU speech detection cannot overlap an active recognizer operation
    Then detector and recognition operations share one serial compute queue
  Scenario: A fatal native fault cannot reuse corrupted runtime state
    Then fatal speech compute errors fence queued native calls until a fresh worker
