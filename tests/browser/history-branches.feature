# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@history-branches
Feature: History branch junctions
  Scenario: One count tag expands and collapses all branches at a junction
    Given a browser repository named "Branch tags" with an empty file "notes.txt"
    When I create separate graph test edits for "ab"
    Given the latest change graph revision and its parent are recorded
    When I undo the latest editor transaction
    Then the code document contains "a" after persistence
    When I type "x" into the code document
    Then the code document contains "ax" after persistence
    Given the second branch revision is recorded
    When I undo the latest editor transaction
    Then the code document contains "a" after persistence
    When I type "y" into the code document
    Then the code document contains "ay" after persistence
    Then the History branch tag toggles all branches at its junction without changing saved history

  Scenario: A nested branch slides without restarting its parent block
    Given a browser repository named "Nested branch blocks" with an empty file "notes.txt"
    When I create separate graph test edits for "ab"
    And I type "z" into the code document
    Then the code document contains "abz" after persistence
    Given the nested branch tip is recorded
    When I undo the latest editor transaction
    Then the code document contains "ab" after persistence
    When I type "x" into the code document
    Then the code document contains "abx" after persistence
    Given the parent branch tip is recorded
    When I undo the latest editor transaction
    And I undo the latest editor transaction
    Then the code document contains "a" after persistence
    When I type "y" into the code document
    Then the code document contains "ay" after persistence
    And the nested History branch slides without restarting its parent block

  Scenario: Model navigation cancels an unfinished branch reveal
    Given a browser repository named "Interrupted branch motion" with an empty file "notes.txt"
    When I create separate graph test edits for "ab"
    And I undo the latest editor transaction
    Then the code document contains "a" after persistence
    When I type "x" into the code document
    Then the code document contains "ax" after persistence
    And model navigation cancels the unfinished History branch reveal

  Scenario: Native branch playback keeps newly revealed nodes connected
    Given a browser repository named "Native branch reveal" with an empty file "notes.txt"
    When I create separate graph test edits for "abcde"
    And I undo the latest editor transaction
    And I undo the latest editor transaction
    And I undo the latest editor transaction
    And I undo the latest editor transaction
    Then the code document contains "a" after persistence
    When I type "x" into the code document
    Then the code document contains "ax" after persistence
    And native History branch playback keeps newly revealed nodes connected
