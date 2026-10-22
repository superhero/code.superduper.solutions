# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Repository indentation conventions
  Scenario: Nested EditorConfig sections inherit and override without changing file bytes
    Then nested editor configuration resolves matching sections and unset values
  Scenario: A nested root bounds configuration lookup
    Then nested root editor configuration stops parent reads
  Scenario: Tab indentation uses explicit or inherited widths
    Then tab indentation configuration resolves fallback widths
  Scenario: Invalid configuration is surfaced instead of silently applied
    Then malformed editor configuration is rejected and unknown preferences ignored
  Scenario: Files without configuration inherit editor defaults
    Then missing editor configuration leaves settings unchanged
