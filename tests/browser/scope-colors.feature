# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@scope-colors
Feature: Globals enclosing scope references and imported bindings in the editor
  Scenario Outline: Undefined values keep literal colors while globals and imported functions keep their pills
    Given a browser repository named "Undefined value colors" with an empty file "main.<extension>"
    When I insert this syntax sample into the code document:
      """
      import { parseSafeInteger } from "./numbers.js";
      const absent = undefined;
      function normalize(value) {
        return value === undefined ? null : parseSafeInteger(value, Math.max(1, 2));
      }
      """
    Then only these references have global scope pills: "Math"
    And these operator samples use their palette roles:
      | expression                   | token            | role     |
      | absent = undefined           | undefined        | number   |
      | value === undefined          | undefined        | number   |
      | ? null                       | null             | number   |
      | parseSafeInteger(value       | parseSafeInteger | imported |
      | Math.max                     | Math             | global   |
    Given a source commit fixture named "Undefined colors baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes keep only these global scope pills: "Math"
    And both diff panes keep the operator sample colors
    Examples:
      | extension |
      | js        |
      | ts        |

  Scenario Outline: Class references retain type styling while ordinary parent variables and globals keep pills
    Given a browser repository named "Class scope colors" with an empty file "main.<extension>"
    When I insert this syntax sample into the code document:
      """
      class Parent {}
      const Expr = class {};
      const ordinary = 1;
      function render() {
        Parent; new Parent(); Parent.name;
        Expr; new Set(); Number(ordinary); Buffer.from("a");
        return Math.max(ordinary, 1);
      }
      """
    Then only these references have parent scope pills: "ordinary ordinary"
    And only these references have global scope pills: "Math"
    And these operator samples use their palette roles:
      | expression          | token    | role   |
      | class Parent        | Parent   | type   |
      | Parent; new Parent  | Parent   | type   |
      | new Parent          | Parent   | type   |
      | Parent.name         | Parent   | type   |
      | Expr; new Set       | Expr     | type   |
      | new Set             | Set      | type   |
      | Number(ordinary)    | Number   | type   |
      | Buffer.from         | Buffer   | type   |
      | Math.max            | Math     | global |
    Given a source commit fixture named "Class colors baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes keep only these parent scope pills: "ordinary ordinary"
    And both diff panes keep only these global scope pills: "Math"
    And both diff panes keep the operator sample colors
    Examples:
      | extension |
      | js        |
      | ts        |
      | jsx       |
      | tsx       |

  Scenario: Editing a class binding to an ordinary variable and undoing updates pill eligibility
    Given a browser repository named "Live class colors" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      class Parent {}
      function render() { return Parent; }
      """
    Then only these references have parent scope pills: ""
    When I replace the syntax sample with:
      """
      const Parent = 1;
      function render() { return Parent; }
      """
    Then only these references have parent scope pills: "Parent"
    When I invoke application "Undo"
    Then only these references have parent scope pills: ""
    When I invoke application "Redo"
    Then only these references have parent scope pills: "Parent"

  Scenario Outline: Arrow captures share this without parent pills while real function boundaries retain them
    Given a browser repository named "Shared this scope" with an empty file "main.<extension>"
    When I insert this syntax sample into the code document:
      """
      const outer = 1;
      const arrow = () => outer;
      function render() {
        const local = 1;
        const nested = () => local;
        const object = { method() { return local; } };
        return outer;
      }
      """
    Then only these references have parent scope pills: "local outer"
    And these operator samples use their palette roles:
      | expression                 | token | role  |
      | const arrow = () => outer   | outer | local |
      | const nested = () => local  | local | local |
    Given a source commit fixture named "Shared this baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes keep only these parent scope pills: "local outer"
    Examples:
      | extension |
      | js        |
      | ts        |
      | jsx       |
      | tsx       |

  Scenario: Editing an arrow into a normal function and undoing updates parent pills
    Given a browser repository named "Live this scope" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const outer = 1;
      const render = () => outer;
      """
    Then only these references have parent scope pills: ""
    When I replace the syntax sample with:
      """
      const outer = 1;
      function render() { return outer; }
      """
    Then only these references have parent scope pills: "outer"
    When I invoke application "Undo"
    Then only these references have parent scope pills: ""
    When I invoke application "Redo"
    Then only these references have parent scope pills: "outer"

  Scenario: Global pills share the parent-scope shape and preserve partial selections in every editor pane
    Given a browser repository named "Global scope pills" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const local = 1;
      function render() { return Math + Math; }
      """
    Then global scope pills retain their rounded fill and partial selections in the editor
    Given a source commit fixture named "Global scope pills baseline" records the current repository
    When I click the file diff toolbar button
    Then global scope pills retain their rounded fill and partial selections in both diff panes

  Scenario: Parent-scope pills preserve partial selections in the editor and both diff panes
    Given a browser repository named "Parent scope pills" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const outer = 1;
      function render() { return outer + outer; }
      """
    Then parent scope pills retain their rounded fill and partial selections in the editor
    Given a source commit fixture named "Parent scope pills baseline" records the current repository
    When I click the file diff toolbar button
    Then parent scope pills retain their rounded fill and partial selections in both diff panes

  Scenario Outline: JS and TS keep globals parent scope references and local names visually distinct
    Given a browser repository named "Reference scope colors" with an empty file "main.<extension>"
    When I insert this syntax sample into the code document:
      """
      import helper, {original as imported} from "source";
      import * as Namespace from "source";
      function attachLineReader(socket) { return socket; }
      const outer = 2;
      const object = { Math: outer };
      function render(input) {
        const local = Math.max(Number(input), outer);
        const value = String(local);
        return [attachLineReader(helper(local)), imported, Namespace.value, object.Math, Boolean(value), Object.keys(object), Buffer.from(value)];
      }
      function shadow(imported) { return imported; }
      function inherited(helper) { return () => helper; }
      """
    Then these syntax tokens have distinct readable colors:
      | token  | role     | occurrence |
      | Math   | property | 1          |
      | Math   | global   | 2          |
      | Number | type     | 1          |
      | String | type     | 1          |
      | Boolean| type     | 1          |
      | Object | type     | 1          |
      | Buffer | type     | 1          |
      | outer  | parent   | 3          |
      | object | parent   | 2          |
      | input  | parameterText    | 2          |
      | local  | local    | 2          |
      | max    | function | 1          |
      | helper | imported | 1          |
      | helper | imported | 2          |
      | helper | parameterText   | 4          |
      | imported | imported | 1        |
      | imported | imported | 2        |
      | imported | parameterText  | 4          |
      | original | local  | 1          |
      | Namespace | imported | 1       |
      | Namespace | imported | 2       |
      | attachLineReader | function | 1 |
      | attachLineReader | parent   | 2 |
      | socket | parameterText | 2               |
    Given a source commit fixture named "Scope baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes retain the reference scope colors
    Examples:
      | extension |
      | js        |
      | ts        |
      | jsx       |
      | tsx       |

  Scenario: Changing scope through editing and undo updates the colors
    Given a browser repository named "Live scope colors" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const outer = 1;
      function render() { return Math.PI + outer; }
      """
    Then these syntax tokens have distinct readable colors:
      | token | role   | occurrence |
      | Math  | global | 1          |
      | outer | parent | 2          |
    When I replace the syntax sample with:
      """
      function render(Math) { const outer = 1; return Math.PI + outer; }
      """
    Then these syntax tokens have distinct readable colors:
      | token | role  | occurrence |
      | Math  | parameterText | 2          |
      | outer | local | 2          |
    When I invoke application "Undo"
    Then these syntax tokens have distinct readable colors:
      | token | role   | occurrence |
      | Math  | global | 1          |
      | outer | parent | 2          |

  Scenario: Scope accents reuse palette colors and stay readable in every palette
    Given a browser repository named "Scope palette colors" with an empty file "main.ts"
    When I insert this syntax sample into the code document:
      """
      import helper from "source";
      interface Profile { label: string }
      const outer = 42;
      function render(input: Profile) { return helper(Math.max(outer, input.label.length)) + "hello"; } // comment
      """
    Then these syntax tokens follow the palette in every color mode:
      | token      | role     | occurrence |
      | interface  | keyword  | 1          |
      | Profile    | type     | 1          |
      | label      | property | 1          |
      | render     | function | 1          |
      | "hello"    | string   | 1          |
      | 42         | number   | 1          |
      | +          | operator | 1          |
      | // comment | comment  | 1          |
      | Math       | global   | 1          |
      | outer      | parent   | 2          |
      | input      | parameterText    | 2          |
      | helper     | imported | 2          |

  Scenario: Minimap colors follow the same global enclosing and imported scope distinctions
    Given a browser repository named "Scope minimap colors" with an empty file "main.js"
    When I prepare a long document with global parent and imported names
    Then the minimap paints all three scope colors and the operator color

  Scenario: Disabling JavaScript syntax clears the scope colors and enabling it restores them
    Given a browser repository named "Scope syntax settings" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      import helper from "source";
      const outer = 1;
      function render(input) { return helper(Math.max(input, outer)) + (() => 1)(); }
      """
    And I set JavaScript syntax highlighting to "disabled"
    Then no scope colors remain in the document
    When I set JavaScript syntax highlighting to "enabled"
    Then these syntax tokens have distinct readable colors:
      | token | role   | occurrence |
      | Math  | global | 1          |
      | outer | parent | 2          |
      | input | parameterText  | 2          |
      | helper | imported | 2       |

  Scenario Outline: Scope colors reuse their existing swatches beside the new operator swatch
    Given a browser repository named "Visible scope palette" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      import helper from "source";
      const outer = 1;
      function render() { return helper(Math.PI + outer); }
      """
    And I set the editor color mode to "<mode>"
    Then these syntax tokens have distinct readable colors:
      | token  | role     | occurrence |
      | Math   | global   | 1          |
      | outer  | parent   | 2          |
      | helper | imported | 2          |
    And the palette includes thirteen swatches with a separate operator color
    Examples:
      | mode  |
      | light |
      | dark  |

  Scenario: Imported pills use blended bodies and matching side shadows and preserve selections
    Given a browser repository named "Imported pills" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      import { helper } from './helpers.js';
      function invoke(value) { return helper(value); }
      """
    Given a source commit fixture named "Imported pill baseline" records the current repository
    Then imported pills have blended bodies and matching side shadows in editor and diff

  Scenario: Parent-scope const references are bold without changing mutable bindings
    Given a browser repository named "Parent constants" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const fixed = 1, {key: alias} = source;
      const flag = true, text = "hello", list = [1, 2];
      const object = {}, callback = () => 1, unknown = readValue();
      const nil = null, missing = undefined, set = new Set([1, null]), map = new Map([["key", {items: [1]}]]);
      const nested = {list, map, set, value: missing}, bad = [() => 1], instance = new Date();
      let mutable = 2; var old = 3;
      function read() { return [fixed, flag, text, list, nil, missing, set, map, nested, alias, object, callback, unknown, bad, instance, mutable, old]; }
      """
    Given a source commit fixture named "Parent constants baseline" records the current repository
    Then parent constants alone are bold in editor and diff
