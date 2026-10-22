# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@context_create
Feature: Navigator context menus create files in the requested directory
  Background:
    When I import a directory with a nested file tree

  Scenario Outline: Creating from a collapsed nested folder's <target> uses that folder
    When I open the repository file "file2.txt"
    And I toggle the repository directory "src"
    Given the current edit and source Git histories are recorded
    And native context menu handling is observed
    When I right-click the <target> of repository row "src/lib"
    Then the "Folder" context menu for "src/lib" replaces the browser menu at the pointer
    And the repository directory "src/lib" is collapsed
    And the open file tab "file2.txt" is selected
    When I choose New file from the folder menu "src/lib"
    Then the New file form contains "src/lib/" with its caret at the end
    When I append the new filename "created.ts" and submit it
    Then the new file "src/lib/created.ts" is open in the editor
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    Examples:
      | target  |
      | padding |
      | icon    |

  Scenario: Blank navigator background creates at the root despite a selected nested file
    When I open the repository file "src/lib/index.ts"
    Given the current edit and source Git histories are recorded
    When I switch repository views in this order:
      | view     |
      | Settings |
    Given native context menu handling is observed
    When I right-click blank navigator background
    Then the repository background menu replaces the browser menu
    And the repository tree file "src/lib/index.ts" is selected
    When I choose New file from the repository background menu
    Then the New file form contains "" with its caret at the end
    When I append the new filename "root.txt" and submit it
    Then the new file "root.txt" is open in the editor
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When I open the repository file "src/lib/index.ts"
    Then the code document contains "Nested source file\n" after persistence

  Scenario: Cancelling folder creation leaves its expansion, file selection, and history untouched
    When I open the repository file "file2.txt"
    Given the current edit and source Git histories are recorded
    When I right-click the padding of repository row "src"
    And I choose New file from the folder menu "src"
    Then the New file form contains "src/" with its caret at the end
    When I cancel the new file form
    Then the repository directory "src" is collapsed
    And the open file tab "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: An existing file path stays in the creation form without overwriting its contents
    When I open the repository file "file2.txt"
    And I toggle the repository directory "src"
    Given the current edit and source Git histories are recorded
    When I right-click the icon of repository row "src/lib"
    And I choose New file from the folder menu "src/lib"
    Then the New file form contains "src/lib/" with its caret at the end
    When I append the new filename "index.ts" and submit it
    Then the creation conflict keeps the path "src/lib/index.ts" available to correct
    When I cancel the new file form
    Then the repository directory "src/lib" is collapsed
    And the open file tab "file2.txt" is selected
    And the edit Git history is unchanged
    And the source Git history is unchanged
    When I open the repository file "src/lib/index.ts"
    Then the code document contains "Nested source file\n" after persistence
