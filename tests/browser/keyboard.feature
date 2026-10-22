# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@editor-keyboard
Feature: Editor keyboard ownership during indentation and Git history
  Background:
    Given a browser repository named "Keyboard fixture" with an empty file "notes.txt"
    And the code editor owns keyboard focus

  Scenario: Tab indents by default and Escape permits keyboard navigation away
    When I enter "one\ntwo" through the focused editor keyboard
    And I press "Control+Home" without refocusing the editor
    And I press "Tab" without refocusing the editor
    Then the focused code document contains "  one\ntwo" after persistence
    When I press "Control+a" without refocusing the editor
    And I press "Tab" without refocusing the editor
    Then the focused code document contains "    one\n  two" after persistence
    When I press "Shift+Tab" without refocusing the editor
    Then the focused code document contains "  one\ntwo" after persistence
    When I press "Escape" without refocusing the editor
    And I press "Tab" without refocusing the editor
    Then keyboard focus has left the code document
    And the code document contains "  one\ntwo" after persistence

  Scenario: Repeated keyboard undo and redo retain focus for subsequent typing
    When I type "a" into the code document
    And I type "b" into the code document
    And I type "c" into the code document
    And I press "Control+z" without refocusing the editor
    Then the focused code document contains "ab" after persistence
    When I press "Control+z" without refocusing the editor
    Then the focused code document contains "a" after persistence
    When I press "Control+Shift+Z" without refocusing the editor
    Then the focused code document contains "ab" after persistence
    When I press "Control+Shift+Z" without refocusing the editor
    Then the focused code document contains "abc" after persistence
    When I press "Control+z" without refocusing the editor
    Then the focused code document contains "ab" after persistence
    When I press "Control+End" without refocusing the editor
    And I enter "x" through the focused editor keyboard
    Then the focused code document contains "abx" after persistence
    And the redo action is unavailable

  Scenario: Pending history keeps keyboard focus and accepts successive undo requests
    When I type "a" into the code document
    And I type "b" into the code document
    And I type "c" into the code document
    Given the next keyboard undo is held at the repository worker
    When I press "Control+z" without refocusing the editor
    Then the pending history keeps the code document focused and read-only
    When I press "Tab" without refocusing the editor
    And I enter "blocked" through the focused editor keyboard
    Then the pending history keeps the code document focused and read-only
    And the pending code document still contains "abc"
    When I press "Control+z" without refocusing the editor
    And I press "Control+z" without refocusing the editor
    And the held keyboard undo is released
    Then the focused code document contains "" after persistence
    When I enter "x" through the focused editor keyboard
    Then the focused code document contains "x" after persistence
