# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@split-resize
Feature: Dragging dividers resizes editable panes
  Scenario: A divider drag preserves aligned tabs and survives reload without entering file history
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    And I drag editor divider 1 by -180 pixels
    Then the adjacent panes have resized by -180 pixels with aligned tabs and minimaps
    When the editor is reloaded after persistence
    Then the resized pane widths are restored
    And file history Undo and Redo are unavailable
    And resizing has not added a file revision

  Scenario: Three panes resize independently and remain scrollable
    Given a browser repository named "Resizable panes" with an empty file "main.js"
    When I fill the primary pane with long split-test source
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    And I drag editor divider 1 by -100 pixels
    Then the adjacent panes have resized by -100 pixels with aligned tabs and minimaps
    When I drag editor divider 2 by 80 pixels
    Then the adjacent panes have resized by 80 pixels with aligned tabs and minimaps
    And all resized panes scroll independently
    When I close editor pane 2
    Then the editor panes show files "main.js,main.js"
    And the remaining panes fill the available width

  Scenario: Divider controls support keyboard resizing minimum widths and cancellation
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    Then editor dividers support keyboard resizing and minimum widths
    And cancelling a divider drag restores its starting widths
