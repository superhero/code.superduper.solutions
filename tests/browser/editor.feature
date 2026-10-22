# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Durable editing through the repository worker
  Background:
    Given a browser repository named "Editing fixture" with an empty file "notes.txt"

  @edit-grouping
  Scenario: Continuous typing becomes one durable private Git history step
    Given the current edit and source Git histories are recorded
    When I type "abc" into the code document
    Then the code document contains "abc" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario: Reloading a repository restores its selected file
    When I type "Choose this file" into the code document
    And the editor is reloaded after persistence
    Then the open file tab "notes.txt" is selected
    Then the code document contains "Choose this file" after persistence

  Scenario: Switching repositories restores each selected file
    When I type "First repository" into the code document
    Given a browser repository named "Second fixture" with an empty file "other.txt"
    When I type "Second repository" into the code document
    And I select the repository "Editing fixture"
    Then the open file tab "notes.txt" is selected
    Then the code document contains "First repository" after persistence
    When I select the repository "Second fixture"
    Then the open file tab "other.txt" is selected
    Then the code document contains "Second repository" after persistence

  Scenario: Undo and redo survive reopening the editor
    When I type "abc" into the code document
    And the editor is reloaded after persistence
    And I open the repository file "notes.txt"
    Then the code document contains "abc" after persistence
    When I undo the latest editor transaction
    Then the code document contains "" after persistence
    When the editor is reloaded after persistence
    And I open the repository file "notes.txt"
    And I redo the latest editor transaction
    Then the code document contains "abc" after persistence

  Scenario: New typing after undo discards the redo path
    When I type "abc" into the code document
    And I undo the latest editor transaction
    And I type "x" into the code document
    Then the code document contains "x" after persistence
    And the redo action is unavailable

  @edit-grouping
  Scenario: Rapid typing followed immediately by undo restores the start of the group
    When I rapidly type "abcdefghijklmnopqrst" and immediately undo
    Then the code document contains "" after persistence
    When the editor is reloaded after persistence
    And I open the repository file "notes.txt"
    Then the code document contains "" after persistence
    When I redo the latest editor transaction
    Then the code document contains "abcdefghijklmnopqrst" after persistence

  Scenario: Ordinary commits stay separate from automatic edit history
    When I type "base" into the code document
    Given a source commit fixture named "Initial source commit" records the current repository
    Given the current edit and source Git histories are recorded
    When I type "x" into the code document
    And I undo the latest editor transaction
    Then the code document contains "base" after persistence
    And the source Git history is unchanged

  Scenario: Renaming preserves the working file and survives reload
    When I type "content" into the code document
    And I rename the selected file to "renamed.txt"
    Then the selected file "renamed.txt" contains "content"
    When the editor is reloaded after persistence
    Then the selected file "renamed.txt" contains "content"
    When I undo the latest editor transaction
    Then the selected file "notes.txt" contains "content"

  Scenario: Deleting a file is undoable after reload
    When I type "keep" into the code document
    And I delete the selected file
    Then the repository file "notes.txt" is absent
    When the editor is reloaded after persistence
    And I undo the latest editor transaction
    Then the selected file "notes.txt" contains "keep"

  Scenario: A stale tab cannot overwrite another tab's accepted edit
    Given another tab has opened the same repository and file
    When I type "owner" into the code document
    And the stale tab tries to type "stale"
    Then the stale tab shows a recoverable conflict
    And reopening the stale tab reads "owner" without overwriting it

