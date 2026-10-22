# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Directory import
  Scenario: Imported nested files round-trip through IndexedDB
    When I import a directory containing nested text files
    Then no repository file is open
    And the imported repository exposes the original nested file contents
    When the editor is reloaded after persistence
    Then the open file tab "nested/hello.txt" is selected
    And the imported repository exposes the original nested file contents

  Scenario: Imported Git metadata preserves source commits and uncommitted files across reload
    When I import a complete Git directory with two commits and uncommitted changes
    Then no repository file is open
    And the imported repository retains its source commits and uncommitted changes
    When the editor is reloaded after persistence
    Then the open file tab "main.ts" is selected
    And the imported repository retains its source commits and uncommitted changes

  Scenario: A linked submodule imports its separately selected Git history
    When I import a linked submodule directory with two commits and uncommitted changes
    Then the import requests the Git directory "../git-metadata"
    When I select the linked submodule Git directory
    Then the Git history import dialog is closed
    And no repository file is open
    And the imported repository retains its source commits and uncommitted changes
    When the editor is reloaded after persistence
    Then the open file tab "main.ts" is selected
    And the imported repository retains its source commits and uncommitted changes

  Scenario: Cancelling a linked submodule import preserves the current repository
    Given a browser repository named "Existing repository" with an empty file "keep.txt"
    When I type "Keep these changes" into the code document
    And the current repository state is recorded
    When I import a linked submodule directory with two commits and uncommitted changes
    Then the import requests the Git directory "../git-metadata"
    When I cancel the Git history import
    Then the Git history import dialog is closed
    And the existing repository remains selected and unchanged
    When the editor is reloaded after persistence
    Then the existing repository remains selected and unchanged

  Scenario: A linked submodule import can retry an incomplete Git directory selection
    When I import a linked submodule directory with two commits and uncommitted changes
    Then the import requests the Git directory "../git-metadata"
    When I select a Git directory without HEAD
    Then the Git history import dialog explains that HEAD is missing
    When I select the linked submodule Git directory
    Then the Git history import dialog is closed
    And no repository file is open
    And the imported repository retains its source commits and uncommitted changes

  Scenario Outline: Rejected Git imports identify the offending path and preserve the current repository
    Given a browser repository named "Existing repository" with an empty file "keep.txt"
    When I type "Keep these changes" into the code document
    And I try to import a directory containing "<kind>" at "<path>"
    Then the rejected import identifies "<path>" and explains "<kind>"
    And the existing repository remains selected and unchanged
    When the editor is reloaded after persistence
    Then the existing repository remains selected and unchanged
    Examples:
      | kind            | path                 |
      | nested Git      | vendor/lib/.git/HEAD |
      | mixed-case Git  | .GIT/HEAD            |

  Scenario: Imported EditorConfig rules control indentation without rewriting original bytes
    When I import a directory with EditorConfig indentation rules
    Then no repository file is open
    And the selected file "nested/source.js" contains "const value = 1;\n"
    When the editor Tab key is configured to indent code
    And I indent the first line of the code document
    Then the code document contains "    const value = 1;\n" after persistence
    And the code editor uses a tab width of 6
    When the editor is reloaded after persistence
    Then the open file tab "nested/source.js" is selected
    And the selected file "nested/source.js" contains "    const value = 1;\n"
    And the code editor uses a tab width of 6

