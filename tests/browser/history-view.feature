# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@history-views
Feature: Repository history graph selection
  Scenario: History graph selection persists per repository and stays selected during file undo and redo
    Given a browser repository named "First graph repository" with an empty file "notes.txt"
    When I type "x" into the code document
    Given a source commit fixture named "First source version" records the current repository
    When I choose the workspace page "History"
    Then the selected history graph is "Staged changes"
    When I select the history graph "Commit history"
    Then the selected history graph is "Commit history"
    And the version graph shows the source commit "First source version"
    When I invoke application "Undo"
    Then the selected history graph is "Commit history"
    When I invoke application "Redo"
    Then the selected history graph is "Commit history"
    When I reload the version history graph
    Then the selected history graph is "Commit history"
    Given a browser repository named "Second graph repository" with an empty file "other.txt"
    When I choose the workspace page "History"
    Then the selected history graph is "Staged changes"
    When I select the repository "First graph repository"
    Then the selected history graph is "Commit history"
    And the version graph shows the source commit "First source version"
    And history navigation fits wide and narrow headers
    When I close the History pane
    And I choose the workspace page "Editor"
    Then the History graph tabs are absent

  Scenario: Staged changes undo centers and focuses the restored revision
    Given a history profiling repository with 2 files and 40 document transactions
    When I choose the workspace page "History"
    And I undo into the middle of the staged history
    Then the restored staged revision is centered, focused and highlighted
    And Tab continues from the restored staged revision
