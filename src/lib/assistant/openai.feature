# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ai-vault-source
Feature: Worker-owned OpenAI transport and public connection profiles
  Scenario: Credentialed requests use fixed endpoints and explicit bounded options
    Then OpenAI requests pin credentials to the official origin and exclude persistence and tools
  Scenario: Fragmented SSE and native completion preserve visible text
    Then OpenAI replies decode split SSE frames and report incomplete failed or missing completion
  Scenario: Known credential echoes never cross text-delta boundaries
    Then OpenAI credential redaction rejects split raw and encoded echoes
  Scenario: Saved profiles contain only validated public connection fields
    Then AI profiles reject credential URLs and retain opaque vault references only
