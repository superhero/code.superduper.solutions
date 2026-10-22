# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@formatting
Feature: Explicit local document formatting preserves the application history
  Background:
    Given JavaScript formatting support is installed

  Scenario: Formatting is one durable edit and an unchanged result is not an action
    Given a browser repository named "Formatting history" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const value={answer:42};
      """
    Given a source commit fixture named "Unformatted source" records the current repository
    And the current edit and source Git histories are recorded
    Then the format action is an enabled icon in the editor toolbar
    When I format the current document
    Then the code document contains "const value = { answer: 42 };\n" after persistence
    And the latest private history subject is "Format document"
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    When I undo the latest editor transaction
    Then the code document contains "const value={answer:42};" after persistence
    When I redo the latest editor transaction
    Then the code document contains "const value = { answer: 42 };\n" after persistence
    And the latest private history subject is "Format document"
    Given the current edit and source Git histories are recorded
    When I format the current document
    Then the edit Git history is unchanged
    And the source Git history is unchanged
    When I undo the latest editor transaction
    Then the code document contains "const value={answer:42};" after persistence
    When the editor is reloaded after persistence
    And I redo the latest editor transaction
    Then the code document contains "const value = { answer: 42 };\n" after persistence

  Scenario Outline: The local <language> formatter runs in the browser
    Given the unformatted "<language>" document fixture is imported
    When I format the current document
    Then the document matches the "<language>" formatting fixture
    And the source Git history is unchanged

    Examples:
      | language             |
      | TypeScript           |
      | JSON                 |
      | Markdown             |
      | Markdown with script |
      | TOML                 |
      | Dockerfile           |
      | Python               |
      | PHP                  |
      | HTML                 |
      | CSS                  |
      | SCSS                 |
      | Less                 |
      | YAML                 |
      | GraphQL              |
      | Vue                  |
      | Angular              |
      | Svelte               |
      | XML                  |
      | C#                   |
      | Visual Basic         |

  @development
  Scenario: A formatter result cannot overwrite typing accepted while it was pending
    Given a browser repository named "Formatting during typing" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const value={answer:42};
      """
    Given the current edit and source Git histories are recorded
    And the next formatting request is held at the formatter worker
    When I start formatting the current document
    Then the pending formatter keeps the code document editable
    When I append "\n// newer edit" to the formatting document
    And the held formatting request is released
    Then the code document contains "const value={answer:42};\n// newer edit" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
    And no formatting error is displayed

  @development
  Scenario: A formatter result cannot overwrite either file after switching tabs
    Given the unformatted "TypeScript" document fixture is imported
    And another formatting document "other.ts" is available
    When I open the repository file "sample.ts"
    Given the current edit and source Git histories are recorded
    And the next formatting request is held at the formatter worker
    When I start formatting the current document
    And I choose the open file tab "other.ts"
    And the held formatting request is released
    Then the code document contains "const other = 7;\n" after persistence
    When I choose the open file tab "sample.ts"
    Then the document still matches the unformatted "TypeScript" fixture
    And the edit Git history is unchanged
    And the source Git history is unchanged
    And no formatting error is displayed

  @development
  Scenario: Undo invalidates a pending formatter result and preserves redo
    Given a browser repository named "Formatting during undo" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const value={answer:42};
      """
    Given the next formatting request is held at the formatter worker
    When I start formatting the current document
    And I undo the latest editor transaction
    And the held formatting request is released
    Then the code document contains "" after persistence
    When I redo the latest editor transaction
    Then the code document contains "const value={answer:42};" after persistence
    And no formatting error is displayed

  @development
  Scenario: A syntax error leaves the document and both Git histories intact
    Given a browser repository named "Formatting syntax error" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const broken = ;
      """
    Given the current edit and source Git histories are recorded
    When I format the current document
    Then the formatter reports an actionable error
    And the code document contains "const broken = ;" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged

  @development
  Scenario: Read-only documents disable formatting
    Given a browser repository named "Read-only formatting" with an empty file "main.js"
    Then the format action is an enabled icon in the editor toolbar
    When the global read-only editor setting is enabled
    Then the format action is unavailable

  @development
  Scenario: Closing the last document disables formatting
    Given a browser repository named "Empty editor formatting" with an empty file "main.js"
    Then the format action is an enabled icon in the editor toolbar
    When I close the file tab "main.js"
    Then no repository file is open
    And the format action is unavailable

  @development
  Scenario: Unsupported documents disable formatting
    Given a browser repository named "Unsupported formatting" with an empty file "notes.txt"
    Then the format action is unavailable

  @development
  Scenario: Typing, saving and reopening do not format implicitly
    Given a browser repository named "Explicit formatting only" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const value={answer:42};
      """
    Given the current edit and source Git histories are recorded
    When I press "Control+s" without refocusing the editor
    And the editor is reloaded after persistence
    Then the code document contains "const value={answer:42};" after persistence
    And the edit Git history is unchanged
    And the source Git history is unchanged

  @development
  Scenario: Installed Prettier packages load inside the development worker
    Given the unformatted "CSS" document fixture is imported
    When I format the current document
    Then the document matches the "CSS" formatting fixture
    And no formatting error is displayed
