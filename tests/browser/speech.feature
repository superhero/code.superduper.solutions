# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Optional browser speech controls
  Scenario: The speech inference engine links to its setup from the engine list
    Then ONNX Runtime Web appears in Inference engines and opens speech settings
  Scenario: Speech model setup follows AI connection styling without downloading weights
    Then AI speech settings expose explicit precision choices and complete TEN-VAD notices
  Scenario: Each Parakeet precision has independent model controls
    Then each Parakeet row loads and removes only its own precision variant
  Scenario: Old speech recordings are discarded without removing downloaded models
    Then previously saved speech recordings are removed while model downloads remain
  Scenario: Speech augments every AI composer through its framed footer
    Then an AI draft exposes speech input beside the composer controls
  Scenario Outline: Installed speech models are chosen where dictation is used
    Then the composer uses <installation> installed speech models and dictates with <selection>

    Examples:
      | installation | selection |
      | one          | cpu       |
      | multiple     | gpu-fp16  |

  Scenario: Cancelled speech loading and conversation changes never request a microphone
    Then cancelling speech loading or switching conversations prevents microphone capture
  Scenario: Missing speech models install directly from the composer selector
    Then the speech model menu installs a missing variant and can cancel its download
  Scenario: Cached speech artifacts are complete only after streaming verification
    Then browser speech storage rejects corrupt streams and restores verified artifacts offline
