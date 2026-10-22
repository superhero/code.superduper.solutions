# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@history-hover
Feature: Long history lists keep pointer feedback lightweight
  Scenario: Hovering history rows reuses the minimap geometry and keeps transitions responsive
    Given a browser repository named "History hover fixture" with an empty file "notes.txt"
    When I type "seed" into the code document
    And I type "next" into the code document
    And I type "last" into the code document
    And I open the version history graph
    Then history hover reports rendering costs for short and long lists
    And hover work stays bounded as history grows
    And history feedback fades smoothly and keeps the minimap colors current
