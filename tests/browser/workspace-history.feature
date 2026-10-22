# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@workspace-history
Feature: File edits restore their selection without replaying navigation
  Scenario: Undoing a text replacement restores its original selection and redo restores the caret
    Given I import a workspace fixture named "Replacement selection history"
    And the editor footer is enabled
    When I open the repository file "beta.txt"
    And I select the workspace text "short" from column 3
    And I replace the selected workspace text with "tiny"
    Then the focused code document contains "A tiny second file.\n" after persistence
    And the workspace caret is collapsed at column 7
    When I press "Control+z" without refocusing the editor
    Then the focused code document contains "A short second file.\n" after persistence
    And the workspace selection contains "short" ending at column 8
    When I press "Control+Shift+Z" without refocusing the editor
    Then the focused code document contains "A tiny second file.\n" after persistence
    And the workspace caret is collapsed at column 7

