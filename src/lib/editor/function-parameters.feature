# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@function-parameters
Feature: Ordinary function parameter bindings and uses
  Scenario: Parameter declarations defaults and body uses share one binding
    Then function parameter names in "main.js" are "first second first first first second" for this source:
      """
      function example(first, second = first) { const local = first; return [first, second, local]; }
      """

  Scenario: Destructured and rest parameters include only bound names
    Then function parameter names in "main.js" are "alias shorthand first rest alias shorthand first rest" for this source:
      """
      function example({key: alias, shorthand}, [first], ...rest) { return [alias, shorthand, first, rest]; }
      """

  Scenario: Methods arrows and function expressions retain their ordinary parameters
    Then function parameter names in "main.js" are "value value" for this source:
      """
      function outer(value) {
        const object = { method(value) { return value; }, expression: function(value) { return value; } };
        class Example { method(value) { return value; } arrow = (value) => value; }
        const arrow = value => value;
        const expression = function named(value) { return value; };
        return value;
      }
      """

  Scenario: Captured parameters keep their origin through closures without coloring method parameters
    Then function parameter names in "main.js" are "value other value other value value value" for this source:
      """
      function outer(value) {
        function inner(other) { return value + other; }
        const object = { method(other) { return value + other; } };
        class Example { method(other) { return value + other; } }
        return () => value;
      }
      """

  Scenario: Block catch and arrow bindings shadow parameters while var redeclarations keep them
    Then function parameter names in "main.js" are "value value value" for this source:
      """
      function example(value) {
        { let value = 1; value; }
        try {} catch (value) { value; }
        const arrow = value => value;
        var value;
        return value;
      }
      value;
      """

  Scenario: Type names and callback signature parameters are not runtime parameters
    Then function parameter names in "main.ts" are "callback value callback value" for this source:
      """
      function example<T>(callback: (arg: T) => number, value?: T) { return callback(value); }
      """

  Scenario: Async and generator declarations also distinguish their parameters
    Then function parameter names in "main.js" are "value value input input" for this source:
      """
      async function load(value) { await value; }
      function* iterate(input) { yield input; }
      """

  Scenario Outline: Parameter ranges stay in their JavaScript grammar and document coordinates
    Then function parameter names in "<path>" are "<parameters>" for this source:
      """
      <source>
      """
    Examples:
      | path       | parameters | source                                                           |
      | main.jsx   | value value | function view(value) { return <div>{value}</div>; }              |
      | main.tsx   | value value | function view(value: string) { return <div>{value}</div>; }      |
      | index.html | value value | <script>function example(value) { return value; }</script>       |
      | main.py    |             | def example(value): return value                                |
      | main.txt   |             | function example(value) { return value; }                       |

  Scenario: Markdown fences keep independent parameter scopes
    Then function parameter names in "README.md" are "value value" for this source:
      """
      ```javascript
      function example(value) { return value; }
      ```
      ```javascript
      value;
      ```
      """

  Scenario: Parameter analysis shares its cache and invalidates it for a different document
    Then function parameter analysis shares scope caches without confusing document identities

  Scenario: Method parameters track defaults destructuring captures and shadowing separately
    Then method parameter names in "main.ts" are "first rest first first rest value value value value value" for this source:
      """
      const object = { method({key: first}, ...rest) { const capture = () => first; { let first = 1; first; } return [first, rest]; } };
      class Example { method(value: number) { var value; return value; } arrow = value => value; }
      function ordinary(value) { return value; }
      """

  Scenario: Arrow and function expression arguments preserve binding identity through captures
    Then method parameter names in "main.js" are "bare bare left right left left right item item" for this source:
      """
      const one = bare => bare;
      const two = ({key: left}, right = left) => () => left + right;
      const three = function named(item) { return item; };
      """
