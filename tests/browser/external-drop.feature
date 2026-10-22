# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@external_drop
Feature: Desktop drops copy complete file batches into the current repository
  Background:
    When I import a directory with a nested file tree

  Scenario: Desktop file batches preserve tabs and binary bytes through reload, undo, and redo
    When I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I choose the open file tab "file2.txt"
    Given the current edit and source Git histories are recorded
    And the desktop "files" drop fixture is ready
    When I drop the desktop selection onto repository entry "dir2"
    Then the desktop selection is copied under "dir2" with exact persisted bytes
    And the open file tab "file2.txt" is selected
    And the open file tabs remain in this order:
      | path       |
      | file2.txt  |
      | file10.txt |
    And the code document contains "Second root file\n" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    Then the desktop selection is copied under "dir2" with exact persisted bytes
    When I undo the latest editor transaction
    Then the desktop drop leaves all repository bytes unchanged
    And exactly 1 distinct Git edit commits precede the recorded history
    When the editor is reloaded after persistence
    And I open the repository file "file2.txt"
    And I redo the latest editor transaction
    Then the desktop selection is copied under "dir2" with exact persisted bytes
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When I open the repository file "dir2/notes.txt"
    Then the code document contains "Desktop notes\n" after persistence
    When I open the repository file "dir2/readme.md"
    Then the code document contains "# Dropped files\n" after persistence

  Scenario: A desktop directory dropped on blank navigator space retains its nested names without opening a file
    Given the current edit and source Git histories are recorded
    And the desktop "directory" drop fixture is ready
    When I drop the desktop selection onto blank navigator space
    Then the desktop selection is copied under "" with exact persisted bytes
    And no repository file is open
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    Then the desktop selection is copied under "" with exact persisted bytes
    And no repository file is open
    When I open the repository file "desktop bundle/nested/hello λ.ts"
    Then the code document contains "export const greeting = 'Hello λ';\n" after persistence
    When I open the repository file "desktop bundle/README.md"
    Then the code document contains "Nested desktop directory\n" after persistence

  Scenario: A collision rejects the entire desktop batch dropped onto a file's parent directory
    When I open the repository file "dir2/index.ts"
    Given the current edit and source Git histories are recorded
    And the desktop "collision" drop fixture is ready
    When I drop the desktop selection onto repository entry "dir2/index.ts"
    Then the desktop drop reports a collision for "dir2/index.ts"
    And the desktop drop leaves all repository bytes unchanged
    And the open file tab "dir2/index.ts" is selected
    And the open file tabs remain in this order:
      | path          |
      | dir2/index.ts |
    And the code document contains "First directory\n" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    Then the desktop drop leaves all repository bytes unchanged
