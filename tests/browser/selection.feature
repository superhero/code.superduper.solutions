# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@selection
Feature: Consistent code selection backgrounds
  Background:
    Given a browser repository named "Code selection" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const first = "hello";
      const second = 42;
      const third = true;
      """

  Scenario Outline: Single-line and multiline selections keep the same readable fill in <mode> mode
    When I set the editor color mode to "<mode>"
    And I select the first code keyword with the keyboard
    Then the selection uses one contrasting fill across 1 code line
    And all 1 isolated selection fragments keep their rounded corners
    And selected code keeps its syntax colors
    When I extend the code selection to the document end
    Then the selection uses one contrasting fill across 3 code lines
    And selected code keeps its syntax colors
    When I collapse the code selection with the keyboard
    Then the active code line background is preserved after collapsing the selection

    Examples:
      | mode  |
      | light |
      | dark  |

  Scenario: Multiple keyboard selections share the same visible background
    When I select the first two code keywords with multiple cursors
    Then the selection uses one contrasting fill across 2 code lines
    And all 2 isolated selection fragments keep their rounded corners
    And selected code keeps its syntax colors
    When I collapse the code selection with the keyboard
    Then the active code line background is preserved after collapsing the selection

  Scenario: A partial multiline selection stays bounded to the selected text on each row
    When I select from inside the first code line to inside the last code line
    Then the selection uses one contrasting fill across 3 code lines
    And the partial multiline selection stays bounded to the selected text on each row
    And the multiline selection appearance is captured

  Scenario: Matching-token outlines follow wrapped fragments without shifting the code
    When the editor displays a repeated wrapped token
    And I select the first wrapped token with the keyboard
    Then the wrapped selection has square joins and rounded exposed corners
    And every matching token fragment has a separate outline without moving the code
    And the selected matching token has only a matching bottom border
    And the matching-token outline appearance is captured
    When I collapse the code selection with the keyboard
    Then matching-token outlines are cleared
    When I select the unique final word
    Then the selected text has no matching bottom border

  Scenario: Matching braces share the token outline style without shifting the code
    When the editor displays a multiline function
    And I move the caret beside the opening function brace
    Then both matching braces have the token outline style without moving the code
    When I move the caret beside the closing function brace
    Then both matching braces have the token outline style without moving the code
    When I move the caret away from the function braces
    Then matching brace highlights and outlines are cleared

  Scenario: Alt Shift Left selects only to the current line start
    Then Alt Shift Left stays on line twenty beneath an if condition
