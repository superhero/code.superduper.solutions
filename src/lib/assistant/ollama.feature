# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ollama-source
Feature: Small direct local Ollama chat transport
  Scenario: Runtime addresses are explicit roots and discovery excludes cloud and embedding models
    Then Ollama discovery validates addresses and returns local chat models only

  Scenario: Streaming preserves split UTF-8 escaped newlines and unterminated final frames
    Then Ollama decodes fragmented native streams without losing text

  Scenario: Cancellation stops stream consumption and releases its reader
    Then stopping Ollama prevents subsequent text callbacks

  Scenario: Malformed oversized failed and interrupted streams remain failures
    Then invalid Ollama replies are rejected and their streams are closed

  Scenario: Chat bounds and generation options stay local and explicit
    Then Ollama requests preserve conversation bounds and use the local native endpoint

  Scenario: Selected model metadata supplies its architecture context maximum
    Then Ollama model context limits use architecture metadata rather than configured defaults
