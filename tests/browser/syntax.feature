# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Readable syntax colors in the code editor
  Scenario: JavaScript tokens remain distinct and readable when color mode changes live
    Given a browser repository named "JavaScript syntax" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      function greet() { return "hello" + 42; } // comment
      """
    And I set the editor color mode to "light"
    Then these syntax tokens have distinct readable colors:
      | token      | role     |
      | function   | keyword  |
      | greet      | function |
      | "hello"    | string   |
      | 42         | number   |
      | // comment | comment  |
    When I set the editor color mode to "dark"
    Then the syntax colors update without reopening the document
    And the syntax tokens keep distinct readable colors

  Scenario: TypeScript filenames enable typed syntax highlighting
    Given a browser repository named "TypeScript syntax" with an empty file "main.ts"
    When I insert this syntax sample into the code document:
      """
      interface Profile { label: string }
      function greet(): Profile { return { label: "hello", count: 42 }; } // comment
      """
    Then these syntax tokens have distinct readable colors:
      | token      | role     |
      | interface  | keyword  |
      | Profile    | type     |
      | label      | property |
      | greet      | function |
      | "hello"    | string   |
      | 42         | number   |
      | // comment | comment  |

  Scenario: Markdown JavaScript fences use the embedded language colors
    Given a browser repository named "Markdown syntax" with an empty file "README.md"
    When I insert this syntax sample into the code document:
      """
      # Example

      ```javascript
      function greet() { return "hello" + 42; } // comment
      ```
      """
    Then these syntax tokens have distinct readable colors:
      | token      | role     |
      | function   | keyword  |
      | greet      | function |
      | "hello"    | string   |
      | 42         | number   |
      | // comment | comment  |

  Scenario: Six syntax colors retain readable contrast across all shipped palettes
    Given a browser repository named "Syntax palette contrast" with an empty file "palette.ts"
    When I insert this syntax sample into the code document:
      """
      interface Profile { label: string }
      function greet(): Profile { return { label: "hello", count: 42 }; } // comment
      """
    Given a source commit fixture named "Syntax contrast baseline" records the current repository
    Then these syntax tokens follow the palette in every color mode:
      | token      | role     |
      | interface  | keyword  |
      | Profile    | type     |
      | label      | property |
      | greet      | function |
      | "hello"    | string   |
      | 42         | number   |
      | // comment | comment  |

  Scenario: Python parser loads locally and highlights its syntax categories
    Given a browser repository named "Python syntax" with an empty file "main.py"
    When I insert this syntax sample into the code document:
      """
      def greet():
          answer = 42
          return "hello" # comment
      """
    Then these syntax tokens have distinct readable colors:
      | token     | role     |
      | def       | keyword  |
      | greet     | function |
      | "hello"   | string   |
      | 42        | number   |
      | # comment | comment  |

  Scenario: Legacy Shell parser loads locally and highlights shell syntax
    Given a browser repository named "Shell syntax" with an empty file "run.sh"
    When I insert this syntax sample into the code document:
      """
      if true; then
        echo hello
      fi # comment
      """
    Then these syntax tokens have distinct readable colors:
      | token     | role    |
      | if        | keyword |
      | # comment | comment |

  @bonfire-keywords
  Scenario: Bonfire keyword hue follows live stylesheet edits without reopening the editor
    Given a browser repository named "Bonfire keywords" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const sample = "hello";
      """
    Then Bonfire keywords retain their orange hue and follow stylesheet changes live
