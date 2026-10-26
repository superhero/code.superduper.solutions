# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@header_navigation
Feature: Repository navigation and the permanent Editor heading
  Scenario Outline: Repository navigation and the Editor heading fit a long repository name at <width> pixels
    Given a browser repository named "A repository with a deliberately long descriptive name" with an empty file "notes.txt"
    When the browser viewport is <width> by 900 pixels
    Then the repository menu and static Editor heading fit their headers
    And the "Repository" header menu marks "A repository with a deliberately long descriptive name" as its only selected choice
    And the editor fills the viewport without horizontal overflow
    Examples:
      | width |
      | 1440  |
      | 760   |
      | 500   |

  Scenario: Settings opens beside the editor with the keyboard before any repository exists
    Then the empty header offers repository actions and Settings
    When I open Settings from its toolbar button with the keyboard
    Then the "Settings" pane is visible
    When I close Settings with the keyboard
    Then the "Editor" pane is visible

  Scenario: Switching header repositories drains accepted edits and restores their selected files
    Given a browser repository named "Header primary" with an empty file "primary.txt"
    And the current edit and source Git histories are recorded
    And a browser repository named "Header secondary" with an empty file "secondary.txt"
    When I select the repository "Header primary"
    And I open the repository file "primary.txt"
    And I rapidly type "abcdefghijklmnopqrstuvwxyz0123456789ABCD" and immediately select header repository "Header secondary"
    Then the open file tab "secondary.txt" is selected
    When I select the repository "Header primary"
    Then the open file tab "primary.txt" is selected
    Then the code document contains "abcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario: Switching header pages keeps pending edits and controls available
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    Given the current edit and source Git histories are recorded
    And repository control availability is being observed
    When I rapidly type "abcdefghijklmnopqrstuvwxyz0123456789ABCD" and immediately select header page "Settings"
    Then the "Settings" pane is visible
    When I switch repository views in this order:
      | view    |
      | History |
      | Editor  |
    Then repository controls stayed available during navigation
    And the code document contains "Tenth root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario: Header menus use context menu colors and expose directory import
    When I import a directory through the repository menu
    Then no repository file is open
    And the "Repository" header menu marks "menu-import" as its only selected choice
    And the "Repository" header menu uses the context menu colors
    When I open the repository file "from-menu.txt"
    Then the code document contains "Imported through the header\n" after persistence
