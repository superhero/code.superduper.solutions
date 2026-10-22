# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@default-settings
Feature: Fresh browser settings match the chosen dark Bonfire appearance
  Scenario: Fresh appearance and typography use the chosen defaults
    Then fresh browser preferences match the chosen default settings

  Scenario: Saved preferences remain authoritative after defaults change
    Then explicit appearance and tab width choices survive reload

  Scenario: The first HTML paint already uses the dark Bonfire defaults
    Then the page without JavaScript uses the chosen default appearance
