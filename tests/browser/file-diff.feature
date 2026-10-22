# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: File diff from the editor toolbar
  Scenario: An editable committed versus current diff persists and follows workspace undo
    Given a browser repository named "File diff" with an empty file "main.js"
    When I type "const value = 1;" into the code document
    Given a source commit fixture named "Diff baseline" records the current repository
    When I prepare changed contents for the file diff
    Given the current edit and source Git histories are recorded
    When I click the file diff toolbar button
    Then the file diff shows committed contents read-only and current contents editable
    And both diff sides use the normal editor selection appearance
    And the diff minimaps match their line change highlights
    And the edit Git history is unchanged
    And the source Git history is unchanged

    When I reload the open file diff
    Then the file diff shows committed contents read-only and current contents editable
    When I invoke application "Undo"
    Then the diff current side matches the committed baseline
    When I invoke application "Redo"
    Then the file diff shows committed contents read-only and current contents editable
    When I click the file diff toolbar button
    Then the normal editor is visible with the current file contents
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: An uncommitted new file compares against an empty baseline
    Given a browser repository named "New file diff" with an empty file "main.js"
    When I type "const fresh = true;" into the code document
    And I click the file diff toolbar button
    Then the file diff has an empty committed side and the new file contents

  Scenario: Both diff panes scroll together through a long file
    Given a browser repository named "Scrollable diff" with an empty file "main.js"
    When I prepare a long file for scrolling the diff
    Given a source commit fixture named "Long diff baseline" records the current repository
    And the current edit and source Git histories are recorded
    When I click the file diff toolbar button
    Then scrolling either diff pane moves both sides together without scrolling the page
    And either diff minimap supports clicking dragging and keyboard scrolling
    And both diff panes can fold and unfold code without changing files
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Opening a diff preserves the visible document location after earlier code is folded
    Given a browser repository named "Diff position" with an empty file "main.js"
    When I prepare a long file for scrolling the diff
    Given a source commit fixture named "Position baseline" records the current repository
    When I scroll inside the editor with an earlier block folded
    And I click the file diff toolbar button
    Then the diff opens at the same visible document location

  Scenario: The committed pane slides in from the left while the current pane moves right
    Given a browser repository named "Diff reveal" with an empty file "main.js"
    When I type "const value = 1;" into the code document
    And I open the file diff while observing its reveal
    Then the committed pane slides in and the current pane moves to the right
    When I close the file diff while observing its return
    Then the committed pane slides away and the current view expands back

  Scenario: Diff minimaps distinguish replaced and deleted committed lines
    Given a browser repository named "Diff minimap deletions" with an empty file "main.js"
    When I prepare a long file for scrolling the diff
    Given a source commit fixture named "Minimap deletion baseline" records the current repository
    When I prepare changed contents for the file diff
    And I click the file diff toolbar button
    Then the diff minimaps match their line change highlights

  Scenario: Minimap canvases stay right aligned while opening and closing a long diff
    Given a browser repository named "Long minimap reveal" with an empty file "main.js"
    When I prepare a long file for scrolling the diff
    Given a source commit fixture named "Long animation baseline" records the current repository
    When I open the file diff while observing its reveal
    Then the committed pane slides in and the current pane moves to the right
    When I close the file diff while observing its return
    Then the committed pane slides away and the current view expands back

  @folding
  Scenario: Both diff panes slide code folds with motion enabled
    Given a browser repository named "Sliding diff folds" with an empty file "main.js"
    And interface motion is enabled
    When I insert this syntax sample into the code document:
      """
      function example() {
        const number = 42;
        return number;
      }
      console.log(example());
      """
    Given a source commit fixture named "Sliding fold baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes slide their code folds open and closed

  @folding
  Scenario: Closing a long function keeps the minimap visible throughout the slide
    Given a browser repository named "Long closing fold" with an empty file "main.js"
    And interface motion is enabled
    When I prepare a long file for scrolling the diff
    And I pause a keyboard code fold halfway through its transition
    Then the code fold is sliding closed
    And the minimap remains visible during the fold slide
    When I finish the code fold transition
    Then the native code fold is collapsed

  @folding
  Scenario: Unfolding near the document bottom does not jump when the slide finishes
    Given a browser repository named "Stable unfold position" with an empty file "main.js"
    And interface motion is enabled
    When I prepare a long file for scrolling the diff
    And I collapse the final long function near the document bottom
    And I pause a placeholder code unfold halfway through its transition
    Then finishing the unfold keeps the function header at its animated position
    And repeating the fold keeps the header fixed in both directions

  Scenario: The diff active row highlights both the line number and folding gutter
    Given a browser repository named "Diff active gutter" with an empty file "main.js"
    When I type "const value = 1;" into the code document
    Given a source commit fixture named "Unchanged diff baseline" records the current repository
    When I click the file diff toolbar button
    Then the diff active row has a continuous gutter highlight

  Scenario Outline: Diff change borders remain continuous beside sparse folding gutters and alignment gaps
    Given a browser repository named "Diff border gaps" with an empty file "main.js"
    When I prepare separated diff blocks with an alignment gap on the "<side>" side
    Given a source commit fixture named "Diff gap baseline" records the current repository
    When I apply the separated diff block changes
    And I click the file diff toolbar button
    Then changed diff rows have continuous inner borders across both gutters
    Examples:
      | side      |
      | committed |
      | current   |
