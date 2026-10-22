# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@history-messages
Feature: History displays concise subjects for edits and explicit formatting
  Scenario Outline: A grouped code edit describes its complete before and after values
    Given a browser repository named "Meaningful history" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const timeout = 5000;
      """
    Given a source commit fixture named "Original timeout" records the current repository
    When I change the timeout to 10000 in the "<view>" view
    Then the latest private history subject is "Change timeout: 5000 → 10000"
    And the latest code edit is the only change in its history graph
    When the editor is reloaded after persistence
    Then the latest private history subject is "Change timeout: 5000 → 10000"
    Examples:
      | view   |
      | editor |
      | split  |
      | diff   |

  Scenario: Formatting in the focused split records its whole-document action
    Given JavaScript formatting support is installed
    And a browser repository named "Split formatting history" with an empty file "main.js"
    When I insert this syntax sample into the code document:
      """
      const value={answer:42};
      """
    Given a source commit fixture named "Unformatted split" records the current repository
    When I open tab "main.js" in split view
    And I activate the split tab "main.js"
    And I format the current document
    Then the latest private history subject is "Format document"
    And the split shows "const value = { answer: 42 };" beside "const value = { answer: 42 };"
    When the editor is reloaded after persistence
    Then the latest private history subject is "Format document"
