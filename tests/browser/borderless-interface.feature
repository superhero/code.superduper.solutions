# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@development @borderless_interface
Feature: Interface controls use borderless surfaces
  Scenario: Filename actions stay borderless through focus, validation, and confirmation
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    Then the filename row and open tab for "file2.txt" stay borderless when focused
    When I right-click the tree filename "file10.txt"
    Then the filename menu for "file10.txt" and its focused actions are borderless
    When I choose Change name for "file10.txt"
    Then the focused filename editor for "file10.txt" is borderless
    When I enter the filename "file2.txt" and press "Enter"
    Then the filename conflict keeps "file2.txt" ready to correct
    And the focused filename editor for "file10.txt" is borderless
    When I enter the filename "file10.txt" and press "Escape"
    Then the filename editor is closed
    When I right-click the tree filename "file10.txt"
    And I choose Delete file for "file10.txt"
    Then the file deletion confirmation names "file10.txt"
    And the deletion dialog has the shared frame and borderless focused buttons

  Scenario: Settings controls stay borderless while CodeMirror retains matching-token outlines
    Given a browser repository named "Borderless settings" with an empty file "main.js"
    When I choose the workspace page "Settings"
    Then Settings surfaces and focused form controls are borderless
    And Settings choices match header menus and support keyboard selection
    When I choose the workspace page "Editor"
    And I insert this syntax sample into the code document:
      """
      const first = 1;
      const second = 2;
      """
    And I select the first code keyword with the keyboard
    Then CodeMirror retains a visible matching-token outline
