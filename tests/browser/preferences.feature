# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Live global preferences and repository inheritance
  Background:
    Given a browser repository named "Preference fixture" with an empty file "notes.txt"

  Scenario: Preferences reconfigure the editor live and persist without editing repository history
    Given the current edit and source Git histories are recorded
    When the global editor font size is set to 20
    Then the code editor uses font size 20
    When the editor is reloaded after persistence
    Then the open file tab "notes.txt" is selected
    Then the code editor uses font size 20
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Repository overrides inherit changed global values after reset
    When the global editor font size is set to 18
    And this repository overrides the editor font size with 24
    Then the code editor uses font size 24
    When the global editor font size is set to 21
    Then the code editor uses font size 24
    When this repository inherits its editor font size again
    Then the code editor uses font size 21
    When the editor is reloaded after persistence
    Then the open file tab "notes.txt" is selected
    Then the code editor uses font size 21

  Scenario: Read-only preferences prevent editing while retaining selection
    When I type "readable" into the code document
    And the global read-only editor setting is enabled
    Then the code document is selectable but rejects document edits

  Scenario: Settings offer global and repository inheritance without a file scope
    When the "global" settings scope sets tab width to 3
    And I choose the workspace page "Settings"
    Then settings scope is selected in the Settings pane header
    And the "repository" settings scope sets tab width to 6
    Then the code editor uses a tab width of 6
    When the editor is reloaded after persistence
    Then the open file tab "notes.txt" is selected
    Then the code editor uses a tab width of 6
    When the "repository" settings scope inherits its tab width again
    Then the code editor uses a tab width of 3
