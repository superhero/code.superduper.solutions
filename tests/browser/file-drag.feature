# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@file_drag
Feature: Native navigator dragging moves repository entries safely
  Background:
    When I import a directory with a nested file tree

  @development
  Scenario: A drag previews the sorted destination and highlights its tree route
    Given native repository dragging is observed
    When I toggle the repository directory "src"
    And I hold repository entry "file2.txt" over folder "src/lib"
    Then the tree previews "src/lib/file2.txt" before "src/lib/index.ts" with a highlighted route
    When I drop onto the preview of "src/lib/file2.txt"
    Then the repository file "file2.txt" is absent
    When I open the repository file "src/lib/file2.txt"
    Then the code document contains "Second root file\n" after persistence

  @development
  Scenario Outline: A highlighted drop survives temporary window focus loss
    When I choose the workspace page "<page>"
    Given native repository dragging is observed
    When I drag "file2.txt" onto "dir2" with a window blur before dropping
    Then the repository file "file2.txt" is absent
    And the workspace page is "<page>"
    When I open the repository file "dir2/file2.txt"
    Then the code document contains "Second root file\n" after persistence

    Examples:
      | page    |
      | Editor  |
      | History |

  @development
  Scenario: A drop survives development updates and animated folder expansion
    Given interface motion is enabled
    When the development application is hot replaced
    And the file navigator finishes hot replacement
    Given native repository dragging is observed
    When I drag "file2.txt" into folder "dir2" after it slides open
    Then the repository file "file2.txt" is absent
    When I open the repository file "dir2/file2.txt"
    Then the code document contains "Second root file\n" after persistence

  Scenario: Dragging a file saves pending edits, preserves tabs, and remains undoable after reload
    When I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I choose the open file tab "file2.txt"
    Given the current edit and source Git histories are recorded
    And native repository dragging is observed
    When I rapidly type "abcdefghijklmnopqrstuvwxyz0123456789ABCD" and drag "file2.txt" onto "dir2"
    Then the repository file "file2.txt" is absent
    And the open file tab "dir2/file2.txt" is selected
    And the open file tabs remain in this order:
      | path           |
      | dir2/file2.txt |
      | file10.txt     |
    And the code document contains "Second root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    And exactly 2 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    And I open the repository file "dir2/file2.txt"
    Then the code document contains "Second root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    When I undo the latest editor transaction
    And I open the repository file "file2.txt"
    Then the code document contains "Second root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    When I redo the latest editor transaction
    And I open the repository file "dir2/file2.txt"
    Then the code document contains "Second root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    And exactly 2 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario: Dragging a folder onto a file uses its parent and blank navigator space moves it to root
    When I open the repository file "src/lib/index.ts"
    And I open the repository file "dir2/index.ts"
    And I choose the open file tab "src/lib/index.ts"
    Given the current edit and source Git histories are recorded
    And native repository dragging is observed
    When I drag repository entry "src" onto "dir2/index.ts"
    Then the repository file "src" is absent
    And the open file tab "dir2/src/lib/index.ts" is selected
    And the code document contains "Nested source file\n" after persistence
    And the open file tabs remain in this order:
      | path                  |
      | dir2/src/lib/index.ts |
      | dir2/index.ts         |
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    Given the current edit and source Git histories are recorded
    When I drag repository entry "dir2/src" to blank navigator space
    Then the repository file "dir2/src" is absent
    And the open file tab "src/lib/index.ts" is selected
    And the code document contains "Nested source file\n" after persistence
    And the open file tabs remain in this order:
      | path             |
      | src/lib/index.ts |
      | dir2/index.ts    |
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When I open the repository file "dir2/index.ts"
    Then the code document contains "First directory\n" after persistence

  @development
  Scenario: Collision, unchanged, descendant, and cancelled drops preserve files and history
    When I open the repository file "src/lib/index.ts"
    And I toggle the repository directory "dir10"
    Given the current edit and source Git histories are recorded
    And native repository dragging is observed
    When I drag repository entry "file2.txt" onto "file10.txt"
    And I drag repository entry "dir10/index.ts" onto "dir2"
    And I drag repository entry "src" onto "src/lib"
    And I cancel dragging "file2.txt" after hovering over folder "dir2"
    Then the open file tab "src/lib/index.ts" is selected
    And the code document contains "Nested source file\n" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged
    When I open the repository file "file2.txt"
    Then the code document contains "Second root file\n" after persistence
    When I open the repository file "file10.txt"
    Then the code document contains "Tenth root file\n" after persistence
    When I open the repository file "dir10/index.ts"
    Then the code document contains "Second directory\n" after persistence
    When I open the repository file "dir2/index.ts"
    Then the code document contains "First directory\n" after persistence
