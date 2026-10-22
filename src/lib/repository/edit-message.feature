# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@history-messages
Feature: Automatic history subjects describe observable changes concisely
  Scenario Outline: Recognizable code and configuration edits receive useful subjects
    Then an edit in "<path>" from «<before>» to «<after>» is described as «<message>»
    Examples:
      | path        | before                         | after                           | message                                  |
      | main.ts     | const timeout = 5000;          | const timeout = 10000;          | Change timeout: 5000 → 10000              |
      | main.ts     | const count = 1;               | const total = 1;               | Rename variable count → total            |
      | main.ts     | function oldName() {}          | function newName() {}          | Rename function oldName → newName         |
      | main.ts     | this.timeout = 5000;           | this.timeout = 10000;          | Change this.timeout: 5000 → 10000         |
      | config.json | "enabled": false              | "enabled": true              | Change enabled: false → true             |
      | config.yml  | retries: 3                     | retries: 4                     | Change retries: 3 → 4                    |
      | main.ts     | if (owner !== null) {          | if (owner === null) {          | Change condition: !== → ===              |
      | main.ts     | return null;                   | return command;                | Change return value: null → command      |
      | main.ts     | socket.write(previous);        | socket.write(message);         | Change call to socket.write: previous → message |
      | main.ts     |                               | function parseFrame() {}       | Add function parseFrame                  |
      | main.py     |                               | def parse_frame():             | Add function parse_frame                 |
      | main.rs     |                               | pub fn parse_frame() {}        | Add function parse_frame                 |
      | main.ts     | class Parser {}               |                                | Remove class Parser                      |
      | main.ts     |                               | interface Result {}            | Add interface Result                     |
      | main.ts     |                               | enum Color {}                  | Add enum Color                           |
      | main.ts     | // previous explanation       | // revised explanation         | Update comment                           |
      | main.ts     | const greeting = "hello";      | const greeting = "welcome";     | Update greeting string                   |
      | notes.txt   | previous words                | revised words                  | Update text                              |
      | main.ts     | \treturn value;               | \t\treturn value;              | Adjust indentation                       |
      | main.ts     | const total = a  + b;         | const total = a + b;           | Adjust whitespace                        |
      | main.ts     | return value;                 | return value;\n                | Add final newline                        |
      | main.ts     | return value;\n               | return value;                  | Remove final newline                     |
      | main.ts     | return value;\r\n             | return value;\n                | Change line endings                      |
      | main.ts     | one\ntwo\nthree               | ONE\ntwo\nTHREE                | Update 2 lines                           |
      | notes.txt   |                               | one\ntwo                       | Add 2 lines                              |
      | notes.txt   | one\ntwo                      |                                | Remove 2 lines                           |

  Scenario: Formatting is identified by its explicit action
    Then whole-document formatting has one short subject and manual layout changes remain distinct

  Scenario: Automatic subjects stay short and cannot introduce Markdown formatting
    Then generated subjects have a bounded single line and preserve literal identifiers
