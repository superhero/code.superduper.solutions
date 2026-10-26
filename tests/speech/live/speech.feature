# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Real browser Parakeet recognition
  Scenario: CPU streaming survives repeated recordings cached reload and permission recovery
    Given the pinned CPU speech artifacts and a public speech microphone fixture
    When the CPU speech model is initialized from verified browser storage
    And I record speech into two separate AI conversations
    Then both conversations receive recognized words without saved recordings
    When the editor reloads with model downloads blocked
    Then the installed speech model starts again from cache
    When microphone permission is denied and then restored
    Then a manual retry records speech successfully
    And the browser has uploaded no audio or transcript

  Scenario: Real TEN-VAD leaves a silent recording empty
    Given the pinned CPU speech artifacts and a silent microphone fixture
    When the CPU speech model is initialized from verified browser storage
    And I record silence and press Stop
    Then no speech is inserted and recognition performs no passes

  Scenario: A sustained pause finalizes speech and a second utterance survives
    Given the pinned CPU speech artifacts and a microphone fixture with two utterances
    When the CPU speech model is initialized from verified browser storage
    And I record the speech pause and second utterance before pressing Stop
    Then the pause finalized pending words and both utterances remain in the draft
