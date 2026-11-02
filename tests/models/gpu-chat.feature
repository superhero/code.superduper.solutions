# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Strict GPU chat and independent native vision
  Scenario: Verified text runtimes work without FP16 and refuse model fallback
    Then strict chat profiles require usable GPU without requiring shader-f16
  Scenario: SDK pairs and build recipes retain their reference hashes
    Then strict chat native artifacts and recipes match their pinned receipts
  Scenario: A long native log cannot erase CPU computation evidence
    Then chat placement retains aggregate audits beyond ordinary log rollover
  Scenario: Unsupported image execution leaves the active text model untouched
    Then a failed vision capability check fetches no model and preserves text
  Scenario Outline: Native image inspection releases vision before restoring text after <outcome>
    Then native image cleanup releases vision before restoring text after "<outcome>"
    Examples:
      | outcome |
      | success |
      | error   |
      | cancel  |
