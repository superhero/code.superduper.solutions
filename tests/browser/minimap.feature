# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Editor minimap
  Scenario: The right minimap scrolls without editing and can be disabled durably
    Given a browser repository named "Minimap" with an empty file "main.js"
    Then the minimap navigates a long document without editing it
    And the minimap can be disabled and restored in Editor details

  Scenario: Minimap colors match the active syntax palette after parser loading and theme changes
    Given a browser repository named "Minimap syntax" with an empty file "main.js"
    Then minimap pixels use the editor syntax colors
    And minimap pixels follow a palette change
