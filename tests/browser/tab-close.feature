# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@tab_close
Feature: Closing file tabs preserves repository contents and accepted edits
  Background:
    When I import a directory with a nested file tree

  Scenario: Inactive, adjacent, and final tab closures leave files and Git history intact
    When I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open the repository file "dir2/index.ts"
    And I choose the open file tab "file10.txt"
    Given the current edit and source Git histories are recorded
    When I close the file tab "file2.txt"
    Then the open file tab "file10.txt" is selected
    And the code document contains "Tenth root file\n" after persistence
    When I close the file tab "file10.txt"
    Then the open file tab "dir2/index.ts" is selected
    And the code document contains "First directory\n" after persistence
    When I open the repository file "file2.txt"
    And I close the file tab "file2.txt"
    Then the open file tab "dir2/index.ts" is selected
    When I close the file tab "dir2/index.ts"
    Then no repository file is open
    And the repository tree item "file2.txt" displays the name "file2.txt"
    And the repository tree item "file10.txt" displays the name "file10.txt"
    And the repository tree item "dir2/index.ts" displays the name "index.ts"
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Closing during rapid typing saves every accepted revision before removing the tab
    When I open the repository file "file2.txt"
    Given the current edit and source Git histories are recorded
    When I rapidly type "abcdefghijklmnopqrstuvwxyz0123456789ABCD" and immediately close the file tab "file2.txt"
    Then no repository file is open
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    And I open the repository file "file2.txt"
    Then the code document contains "Second root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence

  Scenario: Keyboard tab closing transfers focus to the adjacent file or empty editor panel
    When I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open the repository file "dir2/index.ts"
    And I choose the open file tab "file10.txt"
    And I close the file tab "file10.txt" using the keyboard
    Then the open file tab "dir2/index.ts" has keyboard focus
    When I close the file tab "dir2/index.ts" using the keyboard
    Then the open file tab "file2.txt" has keyboard focus
    When I close the file tab "file2.txt" using the keyboard
    Then no repository file is open
    And the empty editor panel has keyboard focus

  Scenario: A save conflict during closing keeps the tab and unsaved buffer available
    Given a browser repository named "Conflicting tab close" with an empty file "notes.txt"
    And another tab has opened the same repository and file
    When I type "owner" into the code document
    Given the current edit and source Git histories are recorded
    And the stale tab's next save is held until closing starts
    When the stale tab tries to type "stale"
    And I request closing the stale file tab "notes.txt" and release its pending save
    Then the stale file tab "notes.txt" retains its unsaved text "stale"
    And the code document contains "owner" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged
