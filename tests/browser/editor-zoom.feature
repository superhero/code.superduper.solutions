# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@editor-zoom
Feature: Editor text zoom
  Background:
    Given a browser repository named "Editor zoom" with an empty file "main.js"
    When I type "const zoom = true;" into the code document

  Scenario: Buttons and Shift wheel adjust persisted editor typography without editing files
    Given the current edit and source Git histories are recorded
    Then zoom buttons and Shift wheel change editor font size and persist it
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Zoom shortcuts can be remapped between the keyboard and mouse wheel
    Then editor zoom bindings can be recorded as keyboard and Shift wheel shortcuts

  Scenario: Ctrl or Command zero resets editor text zoom to one hundred percent
    Then the reset zoom shortcut restores the default editor font size
