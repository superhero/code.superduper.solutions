# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@scope-names
Feature: JavaScript value references and import bindings
  Scenario Outline: Undefined value styling follows lexical bindings
    Then undefined styles in "<path>" are "<styles>" for this source:
      """
      <source>
      """
    Examples:
      | path       | styles                                          | source                                                                                 |
      | main.js    | cm-syntax-undefined cm-syntax-undefined           | const empty = undefined; function read(value) { return value === undefined; }            |
      | main.ts    | cm-syntax-undefined                              | const empty: undefined = undefined;                                                     |
      | main.jsx   | cm-syntax-undefined                              | const element = <div>{undefined}</div>;                                                 |
      | main.tsx   | cm-syntax-undefined                              | const element = <div>{undefined}</div>;                                                 |
      | index.html | cm-syntax-undefined                              | <script>const empty = undefined;</script>                                               |
      | main.js    | cm-function-parameter cm-function-parameter      | function read(undefined) { return undefined; }                                          |
      | main.js    | cm-method-parameter cm-method-parameter          | const read = undefined => undefined;                                                   |
      | main.js    | cm-scope-parent                                 | const undefined = "local"; function read() { return undefined; }                         |
      | main.js    | cm-scope-imported cm-scope-imported               | import { missing as undefined } from "./value.js"; undefined;                            |
      | main.js    |                                                 | const value = {undefined: 1}; value.undefined;                                          |

  Scenario: Markdown JavaScript fences retain plain undefined value styling
    Then undefined styles in "README.md" are "cm-syntax-undefined" for this source:
      """
      ```javascript
      const empty = undefined;
      ```
      """

  Scenario: Indexed viewports preserve highlights crossing visible boundaries and folds
    Then indexed semantic viewports preserve overlapping tokens and separated visible ranges

  Scenario: Combined semantic highlighting is reused without stale document or edit results
    Then semantic highlights reuse unchanged syntax and invalidate changed documents and trees

  Scenario: Parent constants computed from known data retain data-only emphasis inside callbacks
    Then parent-scope constant references in "main.js" are "MAX_LINE_BYTES LABEL" for this source:
      """
      const MAX_LINE_BYTES = 1024 * 1024;
      const LABEL = "limit: " + (MAX_LINE_BYTES / 1024);
      const unknown = 1024 * read(), instance = new Date() + 1;
      function attachLineReader(socket) {
        socket.on("data", chunk => chunk.length > MAX_LINE_BYTES);
        return [LABEL, unknown, instance];
      }
      """

  Scenario: Declared classes retain their identity across scopes and constructor calls
    Then class-like scope references in "main.js" are "Parent Parent Parent" for this source:
      """
      class Parent {}
      function render() { return [Parent, new Parent(), Parent.name]; }
      """

  Scenario: Class expressions mark only their own bindings and preserve named inner classes
    Then class-like scope references in "main.ts" are "Inner Holder Other" for this source:
      """
      const Holder = class Inner { method() { return [Inner, Holder]; } }, ordinary = 1;
      const Other: unknown = /* initializer */ class {};
      function render() { return [Other, ordinary]; }
      """

  Scenario: Builtin constructors are class-like while global namespace objects are not
    Then class-like scope references in "main.js" are "Map Set Boolean Number String Object Buffer Date" for this source:
      """
      Map; Set; Boolean; Number; String; Object; Buffer; Date;
      Math; JSON; Intl; parseInt;
      """

  Scenario: Capitalization and shadowed constructor names do not turn ordinary bindings into classes
    Then class-like scope references in "main.js" are "Set Factory" for this source:
      """
      const Date = 1, Uppercase = 2;
      function render(Map) { return [Date, Map, Uppercase, Set, new Factory()]; }
      """

  Scenario: Arrows inherit the surrounding this context while ordinary functions introduce a parent boundary
    Then scope references in "main.js" are "outer:local input:local outer:parent" for this source:
      """
      const outer = 1;
      const arrow = input => outer + input;
      function regular() { return outer; }
      """

  Scenario: Nested arrows preserve local captures without hiding genuine enclosing function references
    Then scope references in "main.js" are "local:local input:local root:parent arguments:local local:local input:local root:parent arguments:local local:parent" for this source:
      """
      const root = 1;
      function outer(input) {
        const local = 1;
        const arrow = () => [local, input, root, arguments];
        const nested = () => () => [local, input, root, arguments];
        return () => function regular() { return local; };
      }
      """

  Scenario: Shared this highlighting does not leak arrow parameters or locals out of their lexical scope
    Then scope references in "main.js" are "value:local local:local value:local value:local local:unresolved" for this source:
      """
      const value = 1;
      const arrow = value => { const local = value; return () => local + value; };
      value; local;
      """

  Scenario: Arrow properties share their enclosing context while object methods keep their own boundary
    Then scope references in "main.js" are "outer:local outer:parent outer:parent" for this source:
      """
      const outer = 1;
      const object = { arrow: () => outer, method() { return outer; }, nested() { return () => outer; } };
      """

  Scenario: Blocks share this while their declarations remain lexically bounded
    Then scope references in "main.ts" are "value:local value:local own:local own:unresolved" for this source:
      """
      function render() { const value = 1; { value; const own = 2; (() => value + own)(); } own; }
      """

  Scenario: Class field and static block arrows inherit their enclosing this context
    Then scope references in "main.ts" are "Example:local outer:parent local:local Example:parent outer:parent local:local" for this source:
      """
      const outer = 1;
      class Example {
        arrow = () => [Example, outer];
        method() { const local = 1; return () => [local, Example, outer]; }
        static { const local = 1; const arrow = () => local; }
      }
      """

  Scenario: Standard and runtime globals are distinguished from unknown names and properties
    Then scope references in "main.js" are "Math:global Number:global value:unresolved Boolean:global String:global Object:global Buffer:global holder:unresolved" for this source:
      """
      Math.max(Number(value), 1); Boolean; String; Object; Buffer;
      holder.Math; const object = { Number: "Math and Buffer" }; // Object
      """

  Scenario: A function distinguishes its locals and parameters from enclosing bindings
    Then scope references in "main.js" are "outer:parent input:local Math:global local:local input:local" for this source:
      """
      const outer = 1;
      function example(input) { const local = outer + input; return Math.max(local, input); }
      """

  Scenario: Hoisting and temporal dead zones do not turn shadowed locals into globals
    Then scope references in "main.js" are "Math:local Number:local String:local Boolean:local Object:local Math:local Number:local String:local Boolean:local Object:local Math:global" for this source:
      """
      function example() {
        Math; Number; String; Boolean; Object;
        const Math = {}; let Number; var String;
        function Boolean() {} class Object {}
        Math; Number; String; Boolean; Object;
      }
      Math;
      """

  Scenario: Calls to parent scope functions retain their scope through callbacks and hoisting
    Then scope references in "main.js" are "attachLineReader:parent socket:local local:local attachLineReader:parent socket:local socket:local" for this source:
      """
      function serve(socket) {
        attachLineReader(socket);
        function local() {}
        local();
        return () => attachLineReader(socket);
      }
      function attachLineReader(socket) { return socket; }
      """

  Scenario: Parameter defaults cannot see declarations in the function body
    Then scope references in "main.ts" are "Number:global local:local Math:local Number:local Math:local Number:local" for this source:
      """
      function example(Math = Number) {
        const Number = 1; const local = 3;
        { let nested = local; Math; Number; }
        Math; Number;
      }
      """

  Scenario: Destructuring and single parameter arrows introduce real local bindings
    Then scope references in "main.js" are "source:unresolved values:unresolved Math:local Number:local Object:local Math:local Buffer:global" for this source:
      """
      const {Math, a: Number} = source; const [Object] = values;
      Math; Number; Object;
      const run = Math => Math.PI;
      Buffer;
      """

  Scenario: Runtime imports shadow global candidates while type imports do not
    Then scope references in "main.ts" are "ByteBuffer:imported Number:imported Object:imported ByteBuffer:imported Buffer:global Math:global Number:imported Object:imported ByteBuffer:imported Number:imported String:global Boolean:global" for this source:
      """
      import {Buffer as ByteBuffer, type Math, String as Number} from "source";
      import * as Object from "source";
      import type String from "source";
      import type * as Boolean from "source";
      ByteBuffer; Buffer; Math; Number; Object;
      function nested() { ByteBuffer; Number; String; Boolean; }
      """

  Scenario: Catch and loop bindings are limited to their lexical scopes
    Then scope references in "main.js" are "Math:local local:local Math:global list:unresolved Number:local Number:global String:local String:local" for this source:
      """
      try {} catch ({message: Math}) { Math; const local = 1; local; }
      Math;
      for (let Number of list) { Number; }
      Number;
      function example() { for (var String in {}) { String; } String; }
      """

  Scenario: Import comments do not hide aliases or type modifiers
    Then scope references in "main.ts" are "Alias:imported Alias:imported Math:global Buffer:global" for this source:
      """
      import {Buffer as // alias on the following line
      Alias, type /* not a runtime binding */ Math} from "source";
      Alias; Math; Buffer;
      """

  Scenario: Import aliases retain their origin across scopes while local declarations shadow them
    Then scope references in "main.js" are "Default:imported Alias:imported named:imported Namespace:imported Default:imported Alias:imported named:imported Namespace:imported Alias:parent Default:imported Alias:local Alias:local Namespace:local Alias:imported" for this source:
      """
      import Default, {original as Alias, named} from "source";
      import * as Namespace from "source";
      Default; Alias; named; Namespace;
      function outer(Alias) {
        function nested() { Alias; Default; }
        Alias;
      }
      { Alias; const Alias = 1; Namespace; let Namespace; }
      Alias;
      """

  Scenario: Mixed type imports exclude both type names and their aliases from runtime bindings
    Then scope references in "main.ts" are "Default:imported Value:imported Alias:imported Alias:imported Value:imported Math:global Number:global Alias:imported" for this source:
      """
      import Default, {type Math as Number, Value} from "source";
      import type {Buffer as Default} from "types";
      import {type as Alias} from "source";
      Alias; Value; Math; Number;
      function nested() { Alias; }
      """

  Scenario: Named expressions and lexical arguments keep their own scopes
    Then scope references in "main.js" are "Number:global String:local Object:local Math:parent arguments:local arguments:local arguments:local" for this source:
      """
      const Math = function Object(String = Number) {
        const Number = 1; String; Object; Math; arguments;
        const arrow = () => arguments;
        function nested() { arguments; }
      };
      """

  Scenario: Classes namespaces and enums introduce value bindings without treating fields as locals
    Then scope references in "main.ts" are "Math:parent Number:local Object:global Math:local String:local value:local Number:local Buffer:local A:local Boolean:local Boolean:parent" for this source:
      """
      class Math { method(Number) { Math; Number; Object; } }
      Math;
      class Box { static { var String; String; const value = 1; value; } }
      namespace Buffer { export const Number = 1; Number; }
      Buffer;
      enum Boolean { A, B = A }
      Boolean;
      function nested() { Boolean; }
      """

  Scenario: Type declarations do not shadow runtime global objects
    Then scope references in "main.ts" are "Math:global Number:global Number:global Math:global String:global" for this source:
      """
      interface Math { value: string; method(Number: string): void }
      type String = typeof Math;
      const value: typeof Number = Number;
      Math; String;
      """

  Scenario: Markdown code fences retain separate lexical scopes
    Then scope references in "README.md" are "Math:global outer:parent outer:unresolved Buffer:global" for this source:
      """
      ```javascript
      const outer = 1; function example() { Math.max(outer, 1); }
      ```
      ```javascript
      outer; Buffer;
      ```
      """

  Scenario Outline: Scope coloring stays inside JavaScript grammar regions
    Then scope references in "<path>" are "<references>" for this source:
      """
      <source>
      """
    Examples:
      | path       | references                       | source                                                                   |
      | main.jsx   | Math:global outer:local x:local   | const outer = 1; const view = (x) => <div>{Math.PI + outer + x}</div>;       |
      | main.tsx   | Math:global outer:local x:local   | const outer = 1; const view = (x: number) => <div>{Math.PI + outer + x}</div>; |
      | index.html | Math:global outer:parent         | <script>const outer = 1; function f() { Math.max(outer, 1); }</script>      |
      | main.py    |                                  | Math = 1; print(Math)                                                     |
      | main.txt   |                                  | Math; function f() { Buffer; }                                            |

  Scenario: A reused syntax tree cannot reuse another document's names
    Then scope analysis caches trees without confusing document identities

  Scenario: Parent constants distinguish mutable bindings shadowing and arrows that share this
    Then parent-scope constant references in "main.js" are "fixed fixed" for this source:
      """
      const fixed = 1, {key: alias} = source;
      let mutable = 2; var old = 3;
      const shared = () => fixed + alias;
      function read() { fixed; alias; mutable; old; const nested = () => fixed + alias; { let fixed = 4; fixed; } }
      """

  Scenario: Parent constant emphasis only follows known boolean numeric string and array initializers
    Then parent-scope constant references in "main.ts" are "flag count negative text template list asserted grouped object alias" for this source:
      """
      const flag = true, count = 4.56, negative = -2, text = "hello", template = `value ${count}`;
      const list = [{value: 1}], asserted = [1, 2] as const, grouped = ("x");
      const object = {}, callback = () => 1, expression = function() {}, unknown = read(), alias = object;
      const {missing = 1} = source;
      function inspect() { return [flag, count, negative, text, template, list, asserted, grouped, object, callback, expression, unknown, alias, missing]; }
      """

  Scenario: Nested data-only arrays objects Sets Maps and const aliases accept null and undefined
    Then parent-scope constant references in "main.js" are "nil missing values object set map alias emptySet emptyMap" for this source:
      """
      const nil = null, missing = undefined;
      const values = [1, true, "text", nil, missing];
      const object = {values, nested: {ok: false}, ...{extra: [null]}};
      const set = new Set([object, ...values]);
      const map = new Map([["data", set], [nil, {value: missing}]]), alias = map;
      const emptySet = new Set(), emptyMap = new globalThis.Map();
      function read() { return [nil, missing, values, object, set, map, alias, emptySet, emptyMap]; }
      """

  Scenario: Functions methods accessors classes instances unknown values and cycles prevent data-only emphasis
    Then parent-scope constant references in "main.js" are "" for this source:
      """
      const callbacks = [() => 1], object = {nested: {method() {}}}, accessor = {get value() { return 1; }};
      const klass = [class Example {}], instance = {date: new Date()}, unknown = [...load()];
      const set = new Set([() => 1]), map = new Map([["key", new Date()]]);
      const first = second, second = first;
      function read() { return [callbacks, object, accessor, klass, instance, unknown, set, map, first, second]; }
      """

  Scenario: Shadowed Set Map and undefined bindings cannot masquerade as built-in data values
    Then parent-scope constant references in "main.js" are "" for this source:
      """
      function owner(Set, Map, undefined) {
        const set = new Set([1]), map = new Map([]), missing = undefined;
        function read() { return [set, map, missing]; }
      }
      """
