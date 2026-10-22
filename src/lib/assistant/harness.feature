# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ai-harness-source
Feature: Browser Pi harness with explicit repository tools and context budgets
  Scenario: Pi validates tools executes repository reads and replays results to Ollama
    Then the browser Pi harness inspects a repository and replays its tool results

  Scenario: Tool choices isolate repository reads and bound traversal search and output
    Then repository tools enforce enabled capabilities and bounded text access

  Scenario: Context budgets stop requests without silently dropping conversation history
    Then the Pi harness rejects full context and preserves measured runtime usage

  Scenario: Abort stops tool loops and malformed or unknown tool calls stay visible errors
    Then Pi tool loops stop on cancellation and reject unavailable capabilities

  Scenario: AI settings normalize instructions tool choices and per-model context independently
    Then AI harness settings inherit persist and reject malformed values

  Scenario: Settings tools expose selected editor preferences without vault or unrelated data
    Then the read settings tool captures scoped preferences and filters unknown fields

  Scenario: Git tools read ordinary history status branches and changes without mutation
    Then Git tools expose bounded repository history and reject private or invalid references

  Scenario: Browser skills validate inherit and load instructions through Pi only when requested
    Then enabled browser skills advertise metadata and Pi loads their instructions on demand

  Scenario: Large model capacity does not reserve its full context for a small prompt
    Then Ollama context allocation grows with payload while preserving the configured ceiling
