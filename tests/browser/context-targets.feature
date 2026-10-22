# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@context_targets
Feature: Context menus cover complete repository rows and file tabs
  Background:
    When I import a directory with a nested file tree

  Scenario: Tree row padding and icons open the correct nested menu without activating the row
    Given native context menu handling is observed
    When I right-click the padding of repository row "src"
    Then the "Folder" context menu for "src" replaces the browser menu at the pointer
    And the repository directory "src" is collapsed
    And no repository file is open
    When I dismiss the row or tab context menu
    And I toggle the repository directory "src"
    And I toggle the repository directory "src/lib"
    And I right-click the icon of repository row "src/lib"
    Then the "Folder" context menu for "src/lib" replaces the browser menu at the pointer
    And the repository directory "src/lib" is expanded
    And no repository file is open
    When I dismiss the row or tab context menu
    And I right-click the icon of repository row "src/lib/index.ts"
    Then the "File" context menu for "src/lib/index.ts" replaces the browser menu at the pointer
    And no repository file is open
    When I dismiss the row or tab context menu
    And I right-click the padding of repository row "src/lib/index.ts"
    Then the "File" context menu for "src/lib/index.ts" replaces the browser menu at the pointer
    And the repository directory "src" is expanded
    And the repository directory "src/lib" is expanded
    And no repository file is open

  Scenario: Tab padding and close icons open menus without selecting or closing a file
    When I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    Given native context menu handling is observed
    When I right-click the padding of file tab "file2.txt"
    Then the "Tab" context menu for "file2.txt" replaces the browser menu at the pointer
    And the open file tab "file10.txt" is selected
    When I dismiss the row or tab context menu
    And I right-click the padding of file tab "file10.txt"
    Then the "Tab" context menu for "file10.txt" replaces the browser menu at the pointer
    And the open file tab "file10.txt" is selected
    When I dismiss the row or tab context menu
    And I right-click the close icon of file tab "file2.txt"
    Then the "Tab" context menu for "file2.txt" replaces the browser menu at the pointer
    And the open file tab "file10.txt" is selected
    And the code document contains "Tenth root file\n" after persistence
    And the open file tabs remain in this order:
      | path       |
      | file2.txt  |
      | file10.txt |
