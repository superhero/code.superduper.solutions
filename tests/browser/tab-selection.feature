# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@tab-selection
Feature: Tab selection responds before workspace history finishes saving
  Background:
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open the repository file "file2.txt"

  Scenario: Tab switching reports selection and persistence costs independently
    Then repeated tab switches report selection and persistence costs

  Scenario Outline: <pane> tabs stay usable while navigation history is pending
    Given selection targets are ready in the "<pane>" pane
    And the next navigation history write is held
    When I select the first responsive tab target
    Then the responsive tab target is selected and editable before history saves
    When I select the second responsive tab target
    Then the responsive tab target is selected and editable before history saves
    When I edit the responsive tab before its navigation history saves
    And I release the navigation history write
    Then the responsive tab and its edit survive reload

    Examples:
      | pane    |
      | primary |
      | split   |

  Scenario: Switching tabs does not repaint hidden history controls
    Given a history profiling repository with 2 files and 40 document transactions
    Then file switching leaves hidden history controls untouched
