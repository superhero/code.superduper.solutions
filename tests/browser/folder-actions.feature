# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@folder_actions
Feature: Folder actions preserve their complete repository subtree
  Background:
    When I import a directory with a nested file tree

  Scenario: A collapsed folder menu and cancelled rename never expand or open it
    Given the current edit and source Git histories are recorded
    When I right-click the tree folder name "src"
    Then the repository directory "src" is collapsed
    And no repository file is open
    When I choose Change name for the folder "src"
    And I enter the folder name "abandoned" and press "Escape"
    Then the folder name editor is closed
    And the repository directory "src" is collapsed
    And the repository file "abandoned" is absent
    And no repository file is open
    And the edit Git history is unchanged
    And the source Git history is unchanged
    When I open the repository file "src/lib/index.ts"
    And I toggle the repository directory "src"
    Then the repository directory "src" is collapsed
    When I right-click the tree folder name "src"
    And I choose Change name for the folder "src"
    And I enter the folder name "source" and press "Enter"
    Then the folder name editor is closed
    And the repository file "src" is absent
    And the repository directory "source" is collapsed
    And the open file tab "source/lib/index.ts" is selected
    And the code document contains "Nested source file\n" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario: Renaming an expanded folder preserves nested expansion and all open descendant tabs
    Given an additional repository file "src/extra.ts" containing "Extra source\n"
    When I open the repository file "src/lib/index.ts"
    And I open the repository file "file2.txt"
    And I open the repository file "src/lib/index.ts"
    Given the current edit and source Git histories are recorded
    When I right-click the tree folder name "src"
    And I choose Change name for the folder "src"
    And I enter the folder name "source" and press "Enter"
    Then the folder name editor is closed
    And the repository file "src" is absent
    And the repository directory "source" is expanded
    And the repository directory "source/lib" is expanded
    And the repository tree item "source/extra.ts" displays the name "extra.ts"
    And the repository tree file "source/lib/index.ts" is selected
    And the open file tabs remain in this order:
      | path                |
      | source/extra.ts     |
      | source/lib/index.ts |
      | file2.txt           |
    And the open file tab "source/lib/index.ts" is selected
    And the code document contains "Nested source file\n" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    And I open the repository file "source/extra.ts"
    Then the code document contains "Extra source\n" after persistence
    When I open the repository file "source/lib/index.ts"
    Then the code document contains "Nested source file\n" after persistence

  Scenario: Folder deletion removes its whole subtree while preserving similarly named neighbors
    Given an additional repository file "dir2/nested/extra.txt" containing "Nested child\n"
    And an additional repository file "dir20/keep.txt" containing "Neighbor stays\n"
    When I open the repository file "dir2/index.ts"
    And I open the repository file "file2.txt"
    Given the current edit and source Git histories are recorded
    When I right-click the tree folder name "dir2"
    And I choose Delete folder for "dir2"
    Then the folder deletion confirmation names "dir2" and includes its contents
    When I confirm the folder deletion
    Then the repository file "dir2" is absent
    And the repository tree file "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    And the open file tabs remain in this order:
      | path           |
      | dir20/keep.txt |
      | file2.txt      |
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When I choose the open file tab "dir20/keep.txt"
    Then the code document contains "Neighbor stays\n" after persistence
    When I undo the latest editor transaction
    Then the open file tab "file2.txt" is selected
    And the repository file "dir2" is absent
    When I undo the latest editor transaction
    And I open the repository file "dir2/nested/extra.txt"
    Then the code document contains "Nested child\n" after persistence
    When I open the repository file "dir2/index.ts"
    Then the code document contains "First directory\n" after persistence

  Scenario: An existing folder name leaves the draft editable without changing repository history
    Given the current edit and source Git histories are recorded
    When I right-click the tree folder name "dir2"
    And I choose Change name for the folder "dir2"
    And I enter the folder name "dir10" and press "Enter"
    Then the folder name conflict keeps "dir10" ready to correct
    And the repository directory "dir2" is collapsed
    And the repository directory "dir10" is collapsed
    And no repository file is open
    When I enter the folder name "dir10" and press "Escape"
    Then the folder name editor is closed
    And the edit Git history is unchanged
    And the source Git history is unchanged
