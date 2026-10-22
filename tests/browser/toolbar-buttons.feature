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

  Scenario: Settings and History toolbar choices are independent of Editor
    Then each view independently controls its toolbar buttons

  Scenario: Editor history shortcuts open the requested graph and can be hidden
    Then editor history buttons open their graphs and respect toolbar choices
