# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@dropdown_context
Feature: Navigation dropdowns use the same menu for either mouse button
  Scenario Outline: Right-clicking the <dropdown> dropdown keeps its choices and selection
    Given a browser repository named "Dropdown context" with an empty file "notes.txt"
    When I type "base" into the code document
    Given a source commit fixture named "Initial source commit" records the current repository
    Given the current edit and source Git histories are recorded
    And the normal "<dropdown>" dropdown menu is recorded
    And native context menu handling is observed
    When I right-click the icon of the "<dropdown>" dropdown
    Then the "<dropdown>" dropdown shows the same menu and suppresses the browser menu
    When I right-click the text of the already open "<dropdown>" dropdown
    Then the "<dropdown>" dropdown shows the same menu and suppresses the browser menu
    When I dismiss the "<dropdown>" dropdown with Escape
    Then the code document contains "base" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged
    Examples:
      | dropdown   |
      | Repository |
      | Page       |
      | Branch     |
