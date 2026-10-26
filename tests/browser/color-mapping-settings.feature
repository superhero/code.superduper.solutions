# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@color-mapping-settings
Feature: User-controlled editor color mappings
  Scenario: Color mappings update the existing editor both diff panes and selection styling
    Given a browser repository named "Custom colors" with an empty file "main.ts"
    When I insert this syntax sample into the code document:
      """
      import helper from "source";
      interface Example { value: number }
      const outer = 42;
      function attachLineReader(socket) { return socket; }
      function render(input) { const local = Math.max(input, outer); return attachLineReader(helper(local)) + Math.PI; }
      const sample = (x) => x?.value;
      """
    Given a source commit fixture named "Custom color baseline" records the current repository
    And the current edit and source Git histories are recorded
    When I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label            | source     |
      | Local names      | palette-12 |
      | Keywords         | palette-9  |
      | Functions        | palette-8  |
      | Classes and types| palette-11 |
      | Operators        | palette-10 |
      | Dots and access  | palette-9  |
      | Semicolons       | palette-8  |
      | Globals          | palette-13 |
      | Selection        | palette-7  |
      | Active line      | palette-4  |
    And I set selection opacity to 35 percent
    Then the editor color previews match the existing editor without reopening it
    And these operator samples use their palette roles:
      | expression                     | token            | role      |
      | const outer                    | const            | keyword   |
      | interface Example              | Example          | type      |
      | attachLineReader(socket)        | attachLineReader | function  |
      | return socket;                 | socket           | parameterText |
      | Math.max(input, outer)          | Math             | global    |
      | input, outer                   | outer            | parent    |
      | attachLineReader(helper(local)) | attachLineReader | parent    |
      | helper(local)                  | helper           | imported  |
      | + Math.PI                      | +                | operator  |
      | Math.PI                        | .                | dot       |
      | x?.value                       | ?.               | dot       |
      | outer = 42;                    | ;                | semicolon |
    And the editor uses the selected selection color at 35 percent opacity
    When I click the file diff toolbar button
    Then both diff panes keep the operator sample colors
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Parent and import mixes are editable and restore their defaults
    Given a browser repository named "Color mixes" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      import helper from "source";
      const outer = 42;
      function render() { return helper(Math.max(outer, 1)); }
      """
    And I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label        | source     |
      | Parent scope | palette-11 |
    And I set the "Parent scope" secondary color to "palette-10" with 60 percent of the first color
    And I set the "Imports" secondary color to "role-parent" with 25 percent of the first color
    And I reload the editor color settings
    Then the "Parent scope" editor color source is "palette-11"
    And the "Parent scope" color mix is 60 percent
    And the "Imports" color mix is 25 percent
    When I return to the editor from color settings
    Then these operator samples use their palette roles:
      | expression         | token  | role     |
      | helper(Math.max    | helper | imported |
      | max(outer, 1)      | outer  | parent   |
    When I open editor colors in the "global" settings scope
    And I reset the editor color mappings
    Then the "Parent scope" editor color source is "inherit"
    And the "Imports" color blend is disabled

  Scenario: Repository mappings and opacity inherit with separate persistent settings undo and redo
    Given a browser repository named "Scoped color settings" with an empty file "main.js"
    When I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label     | source     |
      | Operators | palette-10 |
    And I open editor colors in the "repository" settings scope
    Then the "Operators" editor color source is "inherit"
    When I set these editor color sources:
      | label     | source    |
      | Operators | palette-9 |
    And I set selection opacity to 45 percent
    And I undo the current color settings
    Then selection opacity is 20 percent
    When I undo the current color settings
    Then the "Operators" editor color source is "inherit"
    When I open editor colors in the "global" settings scope
    Then the "Operators" editor color source is "palette-10"
    When I undo the current color settings
    Then the "Operators" editor color source is "inherit"
    When I reload the editor color settings
    And I open editor colors in the "repository" settings scope
    And I redo the current color settings
    Then the "Operators" editor color source is "palette-9"
    When I redo the current color settings
    Then selection opacity is 45 percent
    When I reset selection color opacity
    Then selection opacity is 20 percent
    When I reset the editor color mappings
    Then the "Operators" editor color source is "inherit"
    Then editor color mappings offer only global and repository settings scopes

  Scenario: Minimap tokens use the configured operator dot and semicolon colors
    Given a browser repository named "Custom minimap colors" with an empty file "main.js"
    When I prepare a long document with global parent and imported names
    And I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label           | source     |
      | Operators       | palette-13 |
      | Dots and access | palette-9  |
      | Semicolons      | palette-11 |
    And I return to the editor from color settings
    Then the minimap paints the configured operator dot and semicolon colors

  Scenario: Editor color controls remain usable on wide and narrow pages
    Given a browser repository named "Responsive editor colors" with an empty file "main.js"
    When I open editor colors in the "global" settings scope
    Then editor color controls fit wide and narrow pages and expose palette swatches

  Scenario: Resetting a blend ratio preserves its colors and supports Settings undo and redo
    Given a browser repository named "Blend ratio reset" with an empty file "main.js"
    When I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label        | source     |
      | Parent scope | palette-11 |
    And I set the "Parent scope" secondary color to "palette-10" with 75 percent of the first color
    And I reset the "Parent scope" color mix
    Then the "Parent scope" color mix is 50 percent
    And the "Parent scope" editor color source is "palette-11"
    And the "Parent scope" secondary color source is "palette-10"
    When I undo the current color settings
    Then the "Parent scope" color mix is 75 percent
    When I redo the current color settings
    And I reload the editor color settings
    Then the "Parent scope" color mix is 50 percent

  Scenario: Repository blend reset restores the inherited ratio and follows later default changes
    Given a browser repository named "Inherited blend reset" with an empty file "main.js"
    When I open editor colors in the "global" settings scope
    And I set the "Parameter text" secondary color to "palette-9" with 35 percent of the first color
    And I open editor colors in the "repository" settings scope
    And I set the "Parameter text" secondary color to "palette-9" with 75 percent of the first color
    And I reset the "Parameter text" color mix
    Then the "Parameter text" color mix is 35 percent
    And the "Parameter text" editor color source is "inherit"
    And the "Parameter text" secondary color source is "palette-9"
    When I open editor colors in the "global" settings scope
    And I set the "Parameter text" secondary color to "palette-9" with 55 percent of the first color
    And I open editor colors in the "repository" settings scope
    Then the "Parameter text" color mix is 55 percent
