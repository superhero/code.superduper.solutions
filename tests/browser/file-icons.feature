# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@file_icons
Feature: Repository file icons follow filenames
  Scenario: Bundled monochrome file icons match the tree and tabs through a rename
    When I import a directory with varied file icon types
    Then no repository file is open
    And the repository tree renders distinct bundled Devicon glyphs:
      | path       | icon             |
      | main.ts    | typescript-plain |
      | helper.js  | javascript-plain |
      | App.svelte | svelte-plain     |
      | script.py  | python-plain     |
    And the file icon for "main.ts" inherits its filename color normally and on hover
    And the repository tree item "notes.unknown" uses the Material icon "code"
    And the repository tree item "main.test.ts" uses the Material icon "experiment"
    And the repository tree item "helper.spec.js" uses the Material icon "experiment"
    And the repository tree item "folder" uses the Material icon "folder"
    When I toggle the repository directory "folder"
    Then the repository tree item "folder" uses the Material icon "folder_open"
    And no repository file is open
    When I open the repository file "main.test.ts"
    Then the tree and open tab for "main.test.ts" share the Material glyph "experiment"
    When I open the repository file "main.ts"
    Then the tree and open tab for "main.ts" share the Devicon glyph "typescript-plain"
    And the file icons are captured
    When I right-click the tree filename "main.ts"
    And I choose Change name for "main.ts"
    And I enter the filename "main.py" and press "Enter"
    Then the filename editor is closed
    And the repository file "main.ts" is absent
    And the tree and open tab for "main.py" share the Devicon glyph "python-plain"
    And the code document contains "export const answer = 42;\n" after persistence
