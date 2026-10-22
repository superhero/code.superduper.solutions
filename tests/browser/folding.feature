# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@folding
Feature: Sliding code folds preserve native editing
  Background:
    Given a browser repository named "Code folding" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      function example() {
        const number = 42;
        return number;
      }
      console.log(example());
      """

  Scenario: Gutter folding and placeholder unfolding slide without creating Git revisions
    Given interface motion is enabled
    And the current edit and source Git histories are recorded
    When I pause a gutter code fold halfway through its transition
    Then the code fold is sliding closed
    And a layout scroll notification does not cancel the closing slide
    When I finish the code fold transition
    Then the native code fold is collapsed
    And the toggled fold header has a two pixel minimap-colored bottom line
    When I pause a placeholder code unfold halfway through its transition
    Then the code fold is sliding open
    And the sliding header retains its bottom boundary
    When I finish the code fold transition
    Then the native code fold is expanded
    And the unfolded header has no bottom boundary
    And the code document contains "function example() {\n  const number = 42;\n  return number;\n}\nconsole.log(example());" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Reduced motion keeps native code folding immediate
    Given code fold motion is reduced
    When I toggle the code fold without animation using the gutter
    Then the native code fold is collapsed
    When I toggle the code fold without animation using the placeholder
    Then the native code fold is expanded
    And the code document contains "function example() {\n  const number = 42;\n  return number;\n}\nconsole.log(example());" after persistence

  Scenario: Reversing a keyboard fold and typing cancels motion without losing an edit
    Given interface motion is enabled
    And the current edit and source Git histories are recorded
    When I pause a keyboard code fold halfway through its transition
    Then the code fold is sliding closed
    When I reverse the paused code fold with the keyboard
    Then the code fold is sliding open
    When I insert "/* note */ " during the paused code fold transition
    Then the native code fold is expanded
    And the code document contains "/* note */ function example() {\n  const number = 42;\n  return number;\n}\nconsole.log(example());" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario Outline: Folding keeps the header stable with compact lines in <font>
    Given interface motion is enabled
    When I use the editor font "<font>" at size 24 and line height 1.2
    Given the fold header geometry is recorded
    When I pause a gutter code fold halfway through its transition
    Then the code fold is sliding closed
    And the animated fold header keeps its original geometry
    When I finish the code fold transition
    Then the native code fold is collapsed
    And the native fold header keeps its original geometry
    When I pause a placeholder code unfold halfway through its transition
    Then the code fold is sliding open
    And the animated fold header keeps its original geometry
    When I finish the code fold transition
    Then the native code fold is expanded
    And the native fold header keeps its original geometry

    Examples:
      | font             |
      | System monospace |
      | Courier New      |
