# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ollama-live
Feature: Explicit local Ornith inference
  Scenario: The browser streams an answer from the user's local Ornith runtime
    Then the Ollama pane receives a real Ornith response
