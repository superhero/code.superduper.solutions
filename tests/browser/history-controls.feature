# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@history-controls
Feature: Stable controls while Git history is restored
  Background:
    When I import a directory with a nested file tree
    And I set the editor color mode to "dark"
    And I open the repository file "file10.txt"
    And I open the repository file "file2.txt"
    And I type "abc" into the code document

  Scenario Outline: Toolbar <operation> preserves control colors while conflicting actions stay blocked
    Given the next toolbar "<operation>" is held at the repository worker
    When I start the observed toolbar history operation
    Then pending history blocks conflicting controls and document edits
    When the observed toolbar history operation is released
    Then the code document contains "<contents>" after persistence
    And unrelated controls kept their colors throughout the history operation

    Examples:
      | operation | contents               |
      | Undo      | Second root file\n     |
      | Redo      | Second root file\nabc  |
