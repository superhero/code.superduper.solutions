# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@operator-colors
Feature: A dedicated palette color for operators
  Scenario: Template interpolation markers use the operator color in the editor and both diff panes
    Given a browser repository named "Template operator colors" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const value = 1;
      const text = `hello ${value} end ${`${value}`}`;
      const plain = "${value}";
      const object = `${{value}.value}`;
      """
    Then these operator samples use their palette roles:
      | expression        | token | role     |
      | hello ${value}    | ${    | operator |
      | value} end        | }     | operator |
      | `${value}`        | ${    | operator |
      | hello ${value}    | hello | string   |
      | hello ${value}    | value | local    |
      | "${value}"        | ${    | string   |
      | "${value}"        | }     | string   |
      | ${{value}.value}  | ${    | operator |
      | {value}.value     | {     | local    |
      | {value}.value     | }     | local    |
      | .value}           | value | property |
    Given a source commit fixture named "Template markers baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes keep the operator sample colors

  Scenario Outline: JavaScript operators use one color while literals comments and punctuation keep theirs
    Given a browser repository named "Operator colors" with an empty file "main.<extension>"
    When I insert this syntax sample into the code document:
      """
      let a = 1, b = 2; a = b;
      a == b; a === b; a != b; a !== b; a < b; a <= b; a > b; a >= b;
      a += b; a -= b; a *= b; a /= b; a %= b; a **= b;
      a++; ++a; a--; --a; a+b; a-b; a*b; a/b; a%b; a**b;
      a & b; a | b; a ^ b; ~a; a && b; a || b; !a; !!a; a ?? b;
      a << b; a >> b; a >>> b; a <<= b; a >>= b; a >>>= b; a &= b; a |= b; a ^= b;
      a &&= b; a ||= b; a ??= b; const f = (x) => x ? a : b; f?.(...[a]); ({...box});
      typeof a; void a; delete box.key; a instanceof Object; "key" in box; new Box(); function* gen(){ yield* [a]; }
      ({key: a}); const text = "text + => ; ..."; const pattern = /a+b*/; // a += b => ; new Box
      """
    Then these operator samples use their palette roles:
      | expression          | token      | role     |
      | a = b               | =          | operator |
      | a = b;              | ;          | operator |
      | a == b              | ==         | operator |
      | a === b             | ===        | operator |
      | a != b              | !=         | operator |
      | a !== b             | !==        | operator |
      | a < b               | <          | operator |
      | a <= b              | <=         | operator |
      | a > b               | >          | operator |
      | a >= b              | >=         | operator |
      | a += b              | +=         | operator |
      | a -= b              | -=         | operator |
      | a *= b              | *=         | operator |
      | a /= b              | /=         | operator |
      | a %= b              | %=         | operator |
      | a **= b             | **=        | operator |
      | a++                 | ++         | operator |
      | ++a                 | ++         | operator |
      | a--                 | --         | operator |
      | --a                 | --         | operator |
      | a+b                 | +          | operator |
      | a-b                 | -          | operator |
      | a*b                 | *          | operator |
      | a/b                 | /          | operator |
      | a%b                 | %          | operator |
      | a**b                | **         | operator |
      | a & b               | &          | operator |
      | a \| b              | \|         | operator |
      | a ^ b               | ^          | operator |
      | ~a                  | ~          | operator |
      | a && b              | &&         | operator |
      | a \|\| b            | \|\|       | operator |
      | !a                  | !          | operator |
      | !!a                 | !!         | operator |
      | a ?? b              | ??         | operator |
      | a << b              | <<         | operator |
      | a >> b              | >>         | operator |
      | a >>> b             | >>>        | operator |
      | a <<= b             | <<=        | operator |
      | a >>= b             | >>=        | operator |
      | a >>>= b            | >>>=       | operator |
      | a &= b              | &=         | operator |
      | a \|= b             | \|=        | operator |
      | a ^= b              | ^=         | operator |
      | a &&= b             | &&=        | operator |
      | a \|\|= b           | \|\|=      | operator |
      | a ??= b             | ??=        | operator |
      | (x) => x            | =>         | operator |
      | x ? a : b           | ?          | operator |
      | x ? a : b           | :          | operator |
      | f?.(...[a])         | ?.         | operator |
      | f?.(...[a])         | ...        | operator |
      | {...box}            | ...        | operator |
      | typeof a            | typeof     | operator |
      | void a              | void       | operator |
      | delete box.key      | delete     | operator |
      | box.key             | .          | operator |
      | a instanceof Object | instanceof | operator |
      | "key" in box        | in         | operator |
      | new Box()           | new        | operator |
      | function* gen()     | *          | operator |
      | yield* [a]          | yield      | operator |
      | yield* [a]          | *          | operator |
      | ({key: a})          | :          | local    |
      | "text + => ; ..."   | +          | string   |
      | "text + => ; ..."   | =>         | string   |
      | "text + => ; ..."   | ;          | string   |
      | /a+b*/              | +          | string   |
      | // a += b => ; new Box | +=       | comment  |
      | // a += b => ; new Box | ;        | comment  |
    Given a source commit fixture named "Operators baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes keep the operator sample colors
    Examples:
      | extension |
      | js        |
      | ts        |
      | jsx       |
      | tsx       |

  Scenario: TypeScript optional rest type and arrow operators follow live palette changes
    Given a browser repository named "TypeScript operators" with an empty file "main.ts"
    When I insert this syntax sample into the code document:
      """
      interface Item { value?: number; invoke(...args: string[]): void }
      const fn = (value?: number) => value!;
      type Combined = Item & {label: string}; type Choice = Item | null;
      const copy = {...source}; const key = value as keyof Item; const checked = value satisfies Item;
      """
    Then these operator samples use their palette roles:
      | expression           | token     | role     |
      | value?: number       | ?         | operator |
      | value?: number       | :         | local    |
      | ...args: string      | ...       | operator |
      | (value?: number)     | ?         | operator |
      | => value!            | =>        | operator |
      | value!               | !         | operator |
      | Item & {label        | &         | operator |
      | Item \| null         | \|        | operator |
      | label: string        | :         | local    |
      | {...source}          | ...       | operator |
      | value as keyof Item  | as        | operator |
      | keyof Item           | keyof     | operator |
      | value satisfies Item | satisfies | operator |
    And the operator color follows live palette changes without reopening the document

  Scenario Outline: Embedded JavaScript uses the operator palette color
    Given a browser repository named "Embedded operators" with an empty file "<file>"
    When I insert this syntax sample into the code document:
      """
      <open>
      const create = (...args) => new Box(...args);
      <close>
      """
    Then these operator samples use their palette roles:
      | expression           | token | role     |
      | const create =       | =     | operator |
      | (...args)            | ...   | operator |
      | => new Box           | =>    | operator |
      | new Box(...args)     | new   | operator |
      | Box(...args)         | ...   | operator |
    Examples:
      | file       | open          | close     |
      | index.html | <script>      | </script> |
      | README.md  | ```javascript | ```       |

  Scenario: Python operators use the shared palette role
    Given a browser repository named "Python operators" with an empty file "main.py"
    When I insert this syntax sample into the code document:
      """
      value = 1 + 2
      value **= 2
      value //= 2
      check = value != 2 and value >= 1
      """
    Then these operator samples use their palette roles:
      | expression       | token | role     |
      | value =          | =     | operator |
      | 1 + 2            | +     | operator |
      | value **= 2      | **=   | operator |
      | value //= 2      | //=   | operator |
      | value != 2       | !=    | operator |
      | 2 and value      | and   | operator |
      | value >= 1       | >=    | operator |

  Scenario: Structural delimiters follow keyword and function colors in editor and diff
    Given a browser repository named "Structural delimiter colors" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      function render(value = {}) { return value; }
      const object = { method(value) { return value; } };
      class Example { method(value) { return value; } }
      const arrow = (value) => { return value; };
      if (ready) { object.method(ready); } else {}
      switch (ready) { case 1: break; }
      try { render(1); } catch (error) { render(2); } finally { render(3); }
      const literal = { value: (ready) };
      class Constructed { constructor(value) { this.value = value; } }
      const instance = new Constructed(ready);
      const list = [];
      process.argv[1]; list[0]; object.items?.[ready];
      function indexed(input) { return input[0]; }
      """
    And I open editor colors in the "global" settings scope
    And I set these editor color sources:
      | label             | source    |
      | Classes and types | palette-8 |
    And I return to the editor from color settings
    Then these operator samples use their palette roles:
      | expression                       | token | role     |
      | function render(                 | (     | function |
      | value = {})                      | )     | function |
      | {}) {                            | {     | local    |
      | ) { return value; }               | {     | function |
      | return value; }                   | }     | function |
      | method(value)                     | (     | function |
      | method(value)                     | )     | function |
      | method(value) {                   | {     | function |
      | class Example { method(value) { return value; } | } | function |
      | (value) =>                        | (     | operator |
      | (value) =>                        | )     | operator |
      | => {                             | {     | operator |
      | if (ready)                       | (     | keyword  |
      | if (ready)                       | )     | keyword  |
      | if (ready) {                     | {     | keyword  |
      | object.method(ready)              | (     | function |
      | object.method(ready)              | )     | function |
      | ready); } else                   | }     | keyword  |
      | else {}                          | {     | keyword  |
      | switch (ready)                   | (     | keyword  |
      | switch (ready)                   | )     | keyword  |
      | switch (ready) {                 | {     | keyword  |
      | break; }                         | }     | keyword  |
      | try {                            | {     | keyword  |
      | render(1); }                     | }     | keyword  |
      | catch (error)                    | (     | keyword  |
      | catch (error)                    | )     | keyword  |
      | catch (error) {                  | {     | keyword  |
      | render(2); }                     | }     | keyword  |
      | finally {                        | {     | keyword  |
      | render(3); }                     | }     | keyword  |
      | literal = {                      | {     | local    |
      | value: (ready)                   | (     | local    |
      | class Constructed {              | {     | type     |
      | this.value = value; } }          | }     | function |
      | constructor(value)              | (     | type     |
      | constructor(value)              | )     | type     |
      | new Constructed(ready)          | (     | type     |
      | new Constructed(ready)          | )     | type     |
      | process.argv[1]                 | [     | property |
      | process.argv[1]                 | ]     | property |
      | list[0]                        | [     | local    |
      | list[0]                        | ]     | local    |
      | object.items?.[ready]           | [     | property |
      | object.items?.[ready]           | ]     | property |
      | input[0]                       | [     | parameterText |
      | input[0]                       | ]     | parameterText |
    Given a source commit fixture named "Structural colors baseline" records the current repository
    When I click the file diff toolbar button
    Then both diff panes keep the operator sample colors
