# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@toolbar-buttons
Feature: Editor toolbar buttons can be chosen in Settings
  Background:
    Given a browser repository named "Toolbar fixture" with an empty file "notes.txt"
    When I type "x" into the code document

  Scenario: Toolbar choices persist and preserve shortcuts and Settings history
    Then toolbar visibility persists with working shortcuts and Settings undo redo

  Scenario: Repository toolbar choices inherit defaults and reset independently
    Then repository toolbar choices inherit defaults and support reset

  Scenario: Settings toolbar choices are independent of the adjacent Editor
    Then Settings independently controls its toolbar buttons

  Scenario: AI connection shortcut is opt-in and its visibility survives reload
    Then the AI connection settings shortcut defaults off and follows its Controls preference

  Scenario: History and Git pane controls stay available after removing the staged shortcut
    Then History remains available without a separate staged toolbar shortcut
