# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@page-minimap
Feature: Page minimaps navigate Settings and History
  Scenario: Settings overview supports click drag keyboard and narrow screens
    When I import a directory with a nested file tree
    Then the Settings minimap navigates the page at wide and narrow widths

  Scenario: History overview navigates multiline source commits
    When I import a directory with a nested file tree
    Given a source commit fixture has long multiline details
    Then the History minimap navigates the long commit

  Scenario: Minimap visibility follows actual vertical overflow
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    Then editor and History minimaps hide when their content fits

  Scenario: Minimap and scrollbar preferences apply live and survive reload
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    Then minimaps default on and scrollbars can be enabled independently
