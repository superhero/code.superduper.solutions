# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@page-minimap
Feature: Page minimaps navigate Settings and History
  Scenario: Settings fill their pane with a matching tab header and thin native scrollbar
    Given a browser repository named "Settings layout" with an empty file "notes.txt"
    Then Settings fill their pane with aligned tabs and a two pixel scrollbar

  Scenario: Settings overview supports click drag keyboard and narrow screens
    When I import a directory with a nested file tree
    Then the Settings minimap navigates the page at wide and narrow widths

  Scenario: History overview navigates multiline source commits
    When I import a directory with a nested file tree
    Given a source commit fixture has long multiline details
    Then the History minimap navigates the long commit

  Scenario: History minimap is opt-in and survives reload with native scrollbar fallback
    When I import a directory with a nested file tree
    Given a source commit fixture has long multiline details
    Then History minimap is independently opt-in with a native scrollbar when disabled

  Scenario: Minimap visibility follows actual vertical overflow
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    Then editor and History minimaps hide when their content fits

  Scenario: Editor and Settings minimap preferences are independent and survive reload
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    Then Settings minimap is opt-in and independent from editor minimaps and scrollbars
