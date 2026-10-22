# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@pane-diff
Feature: File comparisons are tabs inside their own editor pane
  Background:
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view

  Scenario: A split comparison opens a named tab and survives reload independently of file history
    When I watch tab-drag viewport 1
    And I activate the split tab "file2.txt"
    And I click the file diff toolbar button
    Then viewport 2 has tabs "file2.txt,diff://file2.txt" with "diff://file2.txt" selected
    And viewport 2 has a comparison tab named "file2.txt (diff)" showing "Second root file"
    And the watched tab-drag viewport keeps its editor and minimap
    And there are 2 editor pane columns
    When I reload the open file diff
    Then viewport 2 has a comparison tab named "file2.txt (diff)" showing "Second root file"
    And there are 2 editor pane columns
    And file history Undo and Redo are unavailable
    When I close comparison tab "file2.txt (diff)" in viewport 2
    Then viewport 2 has tabs "file2.txt" with "file2.txt" selected
    And there are 2 editor pane columns

  Scenario: Each pane can show its own comparison without replacing the other
    When I select viewport 1 tab "file10.txt"
    And I click the file diff toolbar button
    And I activate the split tab "file2.txt"
    And I click the file diff toolbar button
    Then viewport 1 has a comparison tab named "file10.txt (diff)" showing "Tenth root file"
    And viewport 2 has a comparison tab named "file2.txt (diff)" showing "Second root file"
    When I close primary tab "file10.txt"
    And I close primary tab "file2.txt"
    Then viewport 1 has tabs "diff://file10.txt" with "diff://file10.txt" selected
    When I click the file diff toolbar button
    Then there are 1 editor pane columns
    And viewport 1 has tabs "file2.txt,diff://file2.txt" with "diff://file2.txt" selected
    And viewport 1 has a comparison tab named "file2.txt (diff)" showing "Second root file"

  Scenario: Comparison tabs can move between panes and return to their source document
    When I activate the split tab "file2.txt"
    And I click the file diff toolbar button
    And native tab dragging is observed
    And I drag tab "diff://file2.txt" in viewport 2 after tab "file10.txt" in viewport 1
    Then viewport 1 has a comparison tab named "file2.txt (diff)" showing "Second root file"
    And viewport 2 has tabs "file2.txt" with "file2.txt" selected
    When I select viewport 1 tab "file10.txt"
    Then the primary comparison is hidden
    When I select viewport 1 tab "diff://file2.txt"
    Then viewport 1 has a comparison tab named "file2.txt (diff)" showing "Second root file"

  Scenario: A comparison slides within its own split column
    When I watch tab-drag viewport 1
    And I activate the split tab "file2.txt"
    And I open the file diff while observing its reveal
    Then the committed pane slides in and the current pane moves to the right
    And viewport 2 has a comparison tab named "file2.txt (diff)" showing "Second root file"
    And the watched tab-drag viewport keeps its editor and minimap
    When I close the file diff while observing its return
    Then the committed pane slides away and the current view expands back
    And viewport 2 has tabs "file2.txt" with "file2.txt" selected
    And there are 2 editor pane columns

  Scenario: Toggling a primary comparison closed returns to its source before the next tab
    When I select viewport 1 tab "file2.txt"
    And I click the file diff toolbar button
    Then viewport 1 has tabs "file2.txt,diff://file2.txt,file10.txt" with "diff://file2.txt" selected
    When I click the file diff toolbar button
    Then viewport 1 has tabs "file2.txt,file10.txt" with "file2.txt" selected
    And viewport 2 has tabs "file2.txt" with "file2.txt" selected

  Scenario: Toggling a split comparison closed returns to its source before the next tab
    When native tab dragging is observed
    And I drag tab "file10.txt" in viewport 1 after tab "file2.txt" in viewport 2
    And I select viewport 2 tab "file2.txt"
    And I click the file diff toolbar button
    Then viewport 2 has tabs "file2.txt,diff://file2.txt,file10.txt" with "diff://file2.txt" selected
    When I click the file diff toolbar button
    Then viewport 2 has tabs "file2.txt,file10.txt" with "file2.txt" selected

  Scenario: Comparison columns resize with dragging and keyboard without remounting editors
    When I activate the split tab "file2.txt"
    And I click the file diff toolbar button
    Then the comparison divider resizes both columns and cancels unfinished dragging

  Scenario: Editing the current side of a primary comparison persists and supports undo redo
    When I select viewport 1 tab "file2.txt"
    And I click the file diff toolbar button
    Then comparison viewport 1 saves edits with undo redo while the old side stays read only

  Scenario: Editing the current side of a split comparison persists and supports undo redo
    When I activate the split tab "file2.txt"
    And I click the file diff toolbar button
    Then comparison viewport 2 saves edits with undo redo while the old side stays read only
