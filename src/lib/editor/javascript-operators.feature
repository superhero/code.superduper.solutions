# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@operator-tokens
Feature: Additional JavaScript operator syntax
  Scenario: Template interpolation delimiters are operators without recoloring escaped text or object braces
    Then additional operator tokens in "main.js" are "${ } ${ ${ } } ; ; ${ } ;" for this source:
      """
      const text = `before ${value} after ${`nested ${other}`}`;
      const escaped = `escaped \${literal}`;
      const object = `${{value: 1}.value}`;
      """

  Scenario: Arrows spread rest new and generator stars receive operator ranges
    Then additional operator tokens in "main.js" are "... => new ... ; ... ; * * ; ?. ; ?. ; ?. ;" for this source:
      """
      const value = (...items) => new Box(...items);
      const copy = {...source};
      function* iterate() { yield* source; }
      value?.property; value?.[key]; value?.();
      """

  Scenario: TypeScript optional markers and rest signatures receive operator ranges
    Then additional operator tokens in "main.ts" are "? ; ... ? => ;" for this source:
      """
      interface Example { optional?: string; invoke(...args: string[]): void }
      const fn = (value?: string) => value!;
      """

  Scenario: Operator text inside strings comments and regular expressions is untouched
    Then additional operator tokens in "main.js" are "; ;" for this source:
      """
      const text = "... => new ? * ;";
      const pattern = /new.*=>;/;
      // ... => new ? * ;
      /* ... => new ? * ; */
      """

  Scenario Outline: Additional operator ranges stay within JavaScript grammar regions
    Then additional operator tokens in "<path>" are "<tokens>" for this source:
      """
      <source>
      """
    Examples:
      | path       | tokens | source                                                     |
      | main.jsx   | => ... ; | const render = x => <div {...x} />;                       |
      | main.tsx   | => ... ; | const render = (x: object) => <div {...x} />;              |
      | index.html | => new ; | <script>const create = () => new Box();</script>          |
      | main.py    |        | value = "=> ... new"                                       |
      | main.txt   |        | const create = () => new Box();                            |

  Scenario: Markdown fences retain document coordinates for extra operators
    Then additional operator tokens in "README.md" are "=> new ... ;" for this source:
      """
      Example:
      ```javascript
      const create = () => new Box(...items);
      ```
      """

  Scenario: Control statement brackets follow keywords without recoloring objects or inner grouping
    Then structural delimiters in "main.js" are "(:keyword ):keyword {:keyword }:keyword {:keyword }:keyword (:keyword ):keyword {:keyword }:keyword {:keyword }:keyword (:keyword ):keyword {:keyword }:keyword {:keyword }:keyword" for this source:
      """
      if ((x) && {key: 1}) {} else {}
      switch (x) { case 1: break; }
      try {} catch (error) {} finally {}
      """

  Scenario Outline: Function method arrow and call delimiters share the function role
    Then structural delimiters in "<file>" are "(:function ):function {:function }:function (:function ):function {:function }:function {:type (:function ):function {:function }:function }:type (:operator ):operator {:operator }:operator (:function ):function" for this source:
      """
      <open>
      function render(value = {}) {}
      const object = { method(value) {} };
      class Example { method(value) {} }
      const arrow = (value) => {};
      object.method({key: 1});
      <close>
      """
    Examples:
      | file       | open          | close     |
      | main.js    |               |           |
      | main.ts    |               |           |
      | main.jsx   |               |           |
      | main.tsx   |               |           |
      | index.html | <script>      | </script> |
      | README.md  | ```javascript | ```       |

  Scenario: Class braces and constructor parentheses follow classes while ordinary methods retain function colors
    Then structural delimiters in "main.js" are "{:type (:type ):type {:function }:function (:function ):function {:function }:function }:type (:type ):type {:type (:type ):type {:function }:function }:type" for this source:
      """
      class Example { constructor(value = {}) {} method(value) {} }
      const value = new Example({key: 1});
      const Named = class Inner { constructor() {} };
      """

  Scenario: Indexed access brackets follow the indexed member or binding rather than the index
    Then structural delimiters in "main.js" are "[:property ]:property [:text ]:text [:text ]:text [:text ]:text [:property ]:property (:function ):function {:function [:parameterText ]:parameterText }:function" for this source:
      """
      const list = [];
      process.argv[1]; list[0]; list[0][1]; config.items?.[0];
      function read(input) { return input[0]; }
      """

  Scenario: String quotes are separate from bold content including template delimiters
    Then structural delimiters in "main.js" are "\":string \":string ':string ':string `:string `:string" for this source:
      """
      const double = "hello", single = 'world', template = `value ${name}`;
      """

  Scenario: Object and array delimiters include nested literals and destructuring without indexing or function bodies
    Then object and array declaration delimiters in "main.js" are "{ [ { } ] } [ ] { } [ ]" for this source:
      """
      const object = {items: [{key: 1}]};
      const array = [true, false];
      const {items} = object; const [first] = array;
      function read() { return array[0]; }
      """

  Scenario: Loop parentheses and braces follow keywords for counted iteration in of while and do loops
    Then structural delimiters in "main.js" are "(:keyword ):keyword {:keyword }:keyword (:keyword ):keyword {:keyword }:keyword (:keyword ):keyword {:keyword }:keyword (:keyword ):keyword {:keyword }:keyword {:keyword }:keyword (:keyword ):keyword" for this source:
      """
      for (let index = 0; index < 3; index++) {}
      for (const value of list) {}
      for (const key in object) {}
      while (ready) {}
      do {} while (ready);
      """
