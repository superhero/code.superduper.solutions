# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@function-parameters
Feature: Function parameters use configurable text and shared background pills
  Scenario Outline: Ordinary function parameters and their uses share text styling while methods and arrows stay unchanged
    Given a browser repository named "Function parameter colors" with an empty file "main.<extension>"
    When I insert this syntax sample into the code document:
      """
      function render(input, {value: renamed}, ...rest) { const local = input; return [input, renamed, rest, local]; }
      const object = { method(input) { return input; } };
      class Example { method(input) { return input; } arrow = input => input; }
      const arrow = input => input;
      const expression = function(input) { return input; };
      function shadow(value) { const nested = value => value; return value; }
      """
    Then function parameters use mixed text with shared background pills for names "input renamed rest input input renamed rest value value"
    Given a source commit fixture named "Function parameters baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes retain the function parameter text styling
    Examples:
      | extension |
      | js        |
      | ts        |
      | jsx       |
      | tsx       |

  Scenario: Editing a function into an arrow and undoing updates the parameter treatment
    Given a browser repository named "Live parameter colors" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      function render(value) { return value; }
      """
    Then function parameters use mixed text with shared background pills for names "value value"
    When I replace the syntax sample with:
      """
      const render = value => value;
      """
    Then ordinary function parameter styling is absent
    When I invoke application "Undo"
    Then function parameters use mixed text with shared background pills for names "value value"
    When I invoke application "Redo"
    Then ordinary function parameter styling is absent

  Scenario: Parameter colors follow function settings and can be independently mapped and inherited
    Given a browser repository named "Parameter color settings" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      function render(value) { return value; }
      """
    And I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label     | source    |
      | Functions | palette-8 |
    And I return to the editor from color settings
    Then function parameters use mixed text with shared background pills for names "value value"
    When I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label                | source    |
      | Parameter background | palette-9 |
      | Parameter text       | palette-6 |
    And I reload the editor color settings
    Then the "Parameter background" editor color source is "palette-9"
    When I return to the editor from color settings
    Then function parameter colors use their independent mappings for names "value value"
    When I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label                | source  |
      | Parameter background | inherit |
      | Parameter text       | inherit |
    And I return to the editor from color settings
    Then function parameters use mixed text with shared background pills for names "value value"

  Scenario: The minimap paints parameter backgrounds beneath its text
    Given a browser repository named "Parameter minimap" with an empty file "main.js"
    When I prepare many ordinary functions for the parameter minimap
    Then the minimap paints parameter backgrounds below their text glyphs

  Scenario: Parameter selections remain visible above pills in the editor and diff panes
    Given a browser repository named "Selected function parameters" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      function render(value) { return value; }
      """
    Then selecting part of a parameter keeps the selection visible in the editor
    Given a source commit fixture named "Selected parameters baseline" records the current repository
    When I click the file diff toolbar button
    Then selecting part of a parameter keeps the selection visible in both diff panes

  Scenario Outline: Embedded ordinary function parameters use the same text styling
    Given a browser repository named "Embedded parameters" with an empty file "<file>"
    When I insert this syntax sample into the code document:
      """
      <open>
      function render(value) { return value; }
      <close>
      """
    Then function parameters use mixed text with shared background pills for names "value value"
    Examples:
      | file       | open          | close     |
      | index.html | <script>      | </script> |
      | README.md  | ```javascript | ```       |

  Scenario: Method arguments use eighty percent pane pills in editor and diff
    Given a browser repository named "Method argument pills" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const object = { render(input) { return input; } };
      class Example { render(value) { return value; } }
      function render(plain) { return plain; }
      const arrow = (arrow) => arrow;
      const bare = bare => bare;
      const expression = function(expression) { return expression; };
      """
    Given a source commit fixture named "Method arguments baseline" records the current repository
    Then method parameters have translucent pane pills in the editor and diff

  Scenario: Calls keep normal name pills and shadow-free parentheses in editor and diff
    Given a browser repository named "Called argument pills" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      function invoke(callback) { callback(); return callback; }
      const object = { invoke(handler) { handler(); return handler; } };
      const invokeArrow = run => { run(); return run; };
      function loadEventbusConfig(env) { return env; }
      function start(env) { return loadEventbusConfig(env); }
      """
    Given a source commit fixture named "Called arguments baseline" records the current repository
    Then calls keep normal name pills and shadow-free parentheses in editor and diff
