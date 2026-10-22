# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@history-branch-performance
Feature: Long History animations reuse minimap paint geometry
  Scenario: Expanding a long branch updates the overview without rescanning unchanged messages
    Given a browser repository named "Long branch geometry" with an empty file "notes.txt"
    And a long History rendering fixture with 250 mainline changes
    Then long branch motion reuses unchanged minimap geometry and preserves its pixels
