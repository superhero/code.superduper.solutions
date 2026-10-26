# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Local speech streaming
  Scenario: Silence avoids recognition work
    Given a streaming decoder receiving silence
    When the silent recording stops
    Then the transcript is empty and recognition was never called

  Scenario: A pause finalizes the provisional sentence
    Given provisional words followed by a speech pause
    When the utterance is finalized
    Then the mature transcript preserves the recognized sentence

  Scenario: A repeated phrase survives an overlapping window
    Given a mature phrase followed by the same phrase later
    When a new recognition window overlaps the mature phrase
    Then both genuine repetitions remain exactly once

  Scenario: Silence separates speech intervals with onset and tail context
    Given voice activity around a sustained pause
    Then two separate speech intervals preserve their surrounding context

  Scenario: Continuous features match the upstream preprocessor
    Given continuous audio features for overlapping windows
    Then the feature values match independent preprocessing within tolerance
    And the second window reuses computed feature frames

  Scenario: Stop drains speech while recognition stays serial
    Given a streaming decoder receiving speech faster than inference
    When capture stops during recognition
    Then all received speech is finalized without concurrent recognition

  Scenario: Runtime packaging preserves initialization pins
    Then both CPU and strict WebGPU initialize encoder before decoder
    And every optional speech runtime file fits the Pages file limit

  Scenario: Offline speech factories support the WebGPU backend
    Then the installed speech factory exposes native WebGPU initialization
