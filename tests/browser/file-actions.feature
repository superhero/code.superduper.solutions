# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@file_actions
Feature: File actions belong to their filenames
  Background:
    When I import a directory with a nested file tree

  Scenario: Cancelling an inline rename leaves an unopened file and its history untouched
    Given the current edit and source Git histories are recorded
    When I right-click the tree filename "file10.txt"
    Then no repository file is open
    When I choose Change name for "file10.txt"
    And I enter the filename "abandoned.txt" and press "Escape"
    Then the filename editor is closed
    And the repository tree item "file10.txt" displays the name "file10.txt"
    And the repository file "abandoned.txt" is absent
    And no repository file is open
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: A conflicting filename remains editable until a corrected rename succeeds
    When I open the repository file "file2.txt"
    Given the current edit and source Git histories are recorded
    When I right-click the tree filename "file10.txt"
    And I choose Change name for "file10.txt"
    And I enter the filename "file2.txt" and press "Enter"
    Then the filename conflict keeps "file2.txt" ready to correct
    And the code document contains "Second root file\n" after persistence
    When I enter the filename "renamed10.txt" and press "Enter"
    Then the filename editor is closed
    And the repository file "file10.txt" is absent
    And the repository tree item "renamed10.txt" displays the name "renamed10.txt"
    And the repository tree file "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    And I open the repository file "renamed10.txt"
    Then the code document contains "Tenth root file\n" after persistence

  Scenario: Renaming the current file tab preserves its document and neighboring tabs
    When I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open the repository file "file2.txt"
    Given the current edit and source Git histories are recorded
    When I right-click the tree filename "file2.txt"
    And I choose Change name for "file2.txt"
    And I enter the filename "renamed2.txt" and press "Enter"
    Then the filename editor is closed
    And the open file tabs remain in this order:
      | path         |
      | renamed2.txt |
      | file10.txt   |
    And the open file tab "renamed2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    And the file toolbar has no rename or delete buttons
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario: Deleting an unselected filename confirms that target and remains undoable
    When I open the repository file "file2.txt"
    Given the current edit and source Git histories are recorded
    When I right-click the tree filename "file10.txt"
    And I choose Delete file for "file10.txt"
    Then the file deletion confirmation names "file10.txt"
    When I confirm the filename deletion
    Then the repository file "file10.txt" is absent
    And the repository tree file "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When I undo the latest editor transaction
    Then the repository tree item "file10.txt" displays the name "file10.txt"
    When I open the repository file "file10.txt"
    Then the code document contains "Tenth root file\n" after persistence

  Scenario: Keyboard filename menus restore tree focus without opening a document
    Given the current edit and source Git histories are recorded
    When I open the tree filename menu for "file10.txt" using the keyboard
    Then the filename menu for "file10.txt" offers Change name and Delete file
    And no repository file is open
    When I dismiss the filename menu with Escape
    Then the repository tree item "file10.txt" has focus
    And no repository file is open
    And the edit Git history is unchanged
    And the source Git history is unchanged
