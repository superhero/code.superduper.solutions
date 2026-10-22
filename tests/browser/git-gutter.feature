# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Git line change gutter
  Scenario: Added and modified line markers follow source commits and application undo
    Given a browser repository named "Git gutter" with an empty file "main.js"
    Then an uncommitted new file shows added line markers
    And changed blocks have one pixel inner edges matching the minimap background
    Given a source commit fixture named "Gutter baseline" records the current repository
    Then the Git line change gutter is clear
    When I modify one committed line and insert another
    Then the Git gutter shows one modified and one added line
    And active and changed rows have two pixel gutter separators above and below
    And changed blocks have one pixel inner edges matching the minimap background
    And the minimap shows the same Git line change colors
    And the minimap highlights changed rows across their full width
    When I invoke application "Undo"
    Then the Git line change gutter is clear
    When I invoke application "Redo"
    Then the Git gutter shows one modified and one added line
    And changed blocks have one pixel inner edges matching the minimap background
    And the minimap shows the same Git line change colors
    And the minimap highlights changed rows across their full width
    Given a source commit fixture named "Updated gutter baseline" records the current repository
    Then the Git line change gutter is clear
    And the minimap Git change strip is clear
    When I delete a committed line
    Then a red deletion marker appears in the gutter and minimap
    And the deletion marker and active row share a two pixel separator
    And the minimap highlights changed rows across their full width
    When I invoke application "Undo"
    Then the Git line change gutter is clear
    When I invoke application "Redo"
    Then a red deletion marker appears in the gutter and minimap
    And the minimap highlights changed rows across their full width
    Given a source commit fixture named "Deletion committed" records the current repository
    Then the Git line change gutter is clear
    And the minimap Git change strip is clear

  Scenario: A deletion at the document end reserves space after the final line
    Given a browser repository named "Final deletion spacer" with an empty file "main.js"
    Then an uncommitted new file shows added line markers
    Given a source commit fixture named "Final deletion baseline" records the current repository
    When I delete the final committed line
    Then the deletion marker occupies its own space after the final line
