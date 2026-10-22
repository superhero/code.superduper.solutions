# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@branches
Feature: The branch menu switches real local Git branches safely
  Background:
    Given a browser repository named "Branch fixture" with an empty file "notes.txt"
    When I type "base" into the code document

  Scenario: Creating and switching branches restores their committed files and survives reload
    Given a source commit fixture named "Initial source commit" records the current repository
    Given the current edit and source Git histories are recorded
    When I request a new branch named "feature/editor"
    Then the active branch is "feature/editor"
    And the source Git history is unchanged
    And the branch menu lists these local branches with "feature/editor" selected:
      | branch         |
      | feature/editor |
      | main           |
    When I type " feature" into the code document
    Given a source commit fixture named "Feature source commit" records the current repository
    When I choose the local branch "main"
    Then the active branch is "main"
    And the selected file "notes.txt" contains "base"
    And the source commit messages are:
      | message               |
      | Feature source commit |
      | Initial source commit |
    When I choose the local branch "feature/editor"
    Then the active branch is "feature/editor"
    And the selected file "notes.txt" contains "base feature"
    And the source commit messages are:
      | message               |
      | Feature source commit |
      | Initial source commit |
    When the editor is reloaded after persistence
    Then the active branch is "feature/editor"
    And the open file tab "notes.txt" is selected
    Then the code document contains "base feature" after persistence
    And the branch menu lists these local branches with "feature/editor" selected:
      | branch         |
      | feature/editor |
      | main           |

  Scenario: Branches at the same commit preserve pending files while switching
    Given a source commit fixture named "Initial source commit" records the current repository
    When I type " pending" into the code document
    Given the current edit and source Git histories are recorded
    When I request a new branch named "draft"
    Then the active branch is "draft"
    And the code document contains "base pending" after persistence
    And the source Git history is unchanged
    When I choose the local branch "main"
    Then the active branch is "main"
    And the code document contains "base pending" after persistence
    And the branch menu lists these local branches with "main" selected:
      | branch |
      | draft  |
      | main   |
    And the edit Git history is unchanged
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    Then the active branch is "main"
    When I open the repository file "notes.txt"
    Then the code document contains "base pending" after persistence

  Scenario: Invalid and duplicate branch names keep the form editable and Git unchanged
    Given a source commit fixture named "Initial source commit" records the current repository
    Given the current edit and source Git histories are recorded
    When I request a new branch named "bad..name"
    Then the new branch form rejects "bad..name" as "invalid"
    When I cancel the new branch form
    And I request a new branch named "topic./child"
    Then the new branch form rejects "topic./child" as "invalid"
    When I cancel the new branch form
    Then the active branch is "main"
    And the code document contains "base" after persistence
    When I request a new branch named "main"
    Then the new branch form rejects "main" as "duplicate"
    When I cancel the new branch form
    Then the active branch is "main"
    And the branch menu lists these local branches with "main" selected:
      | branch |
      | main   |
    And the code document contains "base" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: An unborn repository requests an initial commit before creating a branch
    Given the current edit and source Git histories are recorded
    When I request a new branch named "feature"
    Then the new branch form rejects "feature" as "unborn"
    When I cancel the new branch form
    Then the active branch is "main"
    And the code document contains "base" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged
