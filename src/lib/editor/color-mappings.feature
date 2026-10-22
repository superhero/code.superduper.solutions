# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@color-mapping-settings
Feature: Validated editor color mappings
  Scenario: Existing syntax and selection colors remain the default recipes
    Then default editor color mappings preserve the existing palette and scope mixes

  Scenario: Stored color mappings accept only known colors and bounded mixes
    Then malformed editor color mappings cannot inject CSS or cyclic references

  Scenario: Repository color mappings inherit independently and survive serialization
    Then editor color mappings persist and inherit by role without becoming file preferences

  Scenario: Selection opacity is bounded without replacing the chosen selection color
    Then selection opacity validates and inherits independently of color mappings
