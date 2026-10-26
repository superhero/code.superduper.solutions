# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@scoped-history
Feature: File and settings undo histories stay in their own scope
  Scenario: File undo preserves tabs and splits and survives independent settings changes
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I type "x" into the code document
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    And I select viewport 1 tab "file10.txt"
    Then file and settings history stay independent while the current panes remain selected

  Scenario: Settings undo and redo are isolated by the selected scope
    Given a browser repository named "Settings scope history" with an empty file "main.js"
    Then global and repository settings use independent history buttons
