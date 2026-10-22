# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@change-graph
Feature: Real Git ancestry in the change graph
  Scenario: Selecting an earlier change restores files and keeps retained futures available
    Given a browser repository named "Revision selection fixture" with an empty file "notes.txt"
    And a source commit fixture named "Source snapshot" records the current repository
    When I type "a" into the code document
    And I type "b" into the code document
    And I type "c" into the code document
    Given selectable earlier and latest change revisions are recorded
    When I open the version history graph
    And I click the checkpoint area of the recorded "earlier" change
    Then the recorded "earlier" change is current without leaving History
    And the code document contains "a" after persistence
    When I invoke application "Undo"
    Then the recorded "latest" change is current without leaving History
    And the code document contains "abc" after persistence
    When I click the checkpoint area of the recorded "earlier" change
    And I click the checkpoint area of the recorded "latest" change
    Then the recorded "latest" change is current without leaving History
    And the code document contains "abc" after persistence
    When I select the history graph "Commit history"
    Then selecting the current source commit leaves both histories unchanged

  @auto-stash-ui
  Scenario: Version checkout automatically stashes edits and staging and restores them on return
    Given a browser repository named "Source checkout fixture" with an empty file "notes.txt"
    When I type "a" into the code document
    Given a source commit fixture named "First source version" records the current repository
    When I type "b" into the code document
    Given a source commit fixture named "Second source version" records the current repository
    And the earlier and latest source versions are recorded
    When I open the version history graph
    And I select the history graph "Commit history"
    And I check out the recorded "earlier" source version
    Then the recorded "earlier" source version is current in History
    And the branch menu shows the earlier detached commit
    And the code document contains "a" after persistence
    When I reload the version history graph
    Then the recorded "earlier" source version is current in History
    And the branch menu shows the earlier detached commit
    When I choose the local branch "main"
    Then the active branch is "main"
    And the recorded "latest" source version is current in History
    And the code document contains "ab" after persistence
    When I choose the workspace page "Editor"
    And I type "!" into the code document
    And I stage the current file before continuing the checkout draft
    And I type "?" into the code document
    And I choose the workspace page "History"
    And I check out the recorded "earlier" source version
    Then the recorded "earlier" source version is current in History
    And the code document contains "a" after persistence
    When I choose the workspace page "Editor"
    And I type " older" into the code document
    And the editor is reloaded after persistence
    And I choose the local branch "main"
    Then the active branch is "main"
    And the recorded "latest" source version is current in History
    And the code document contains "ab!?" after persistence
    And the current file retains its staged checkout draft
    When I check out the recorded "earlier" source version
    Then the code document contains "a older" after persistence

  Scenario: Change graphs belong to source commits and survive revisits and reload
    Given a browser repository named "Commit graph scope fixture" with an empty file "notes.txt"
    When I type "a" into the code document
    Given a source commit fixture named "First source version" records the current repository
    Then the current source commit has an empty change graph
    When I type "b" into the code document
    Given the current commit change graph is recorded
    And a source commit fixture named "Second source version" records the current repository
    Then the current source commit has an empty change graph
    Given the earlier and latest source versions are recorded
    When I open the version history graph
    And I select the history graph "Commit history"
    And I check out the recorded "earlier" source version
    And I select the history graph "Staged changes"
    Then the recorded commit change graph is restored without loading its edits
    And the code document contains "a" after persistence
    When I select the history graph "Commit history"
    And I check out the recorded "latest" source version
    And I select the history graph "Staged changes"
    Then the current source commit has an empty change graph
    And the code document contains "ab" after persistence
    When I select the history graph "Commit history"
    And I check out the recorded "earlier" source version
    And I select the history graph "Staged changes"
    Then the recorded commit change graph is restored without loading its edits
    When I reload the version history graph
    Then the recorded commit change graph is restored without loading its edits
    And the code document contains "a" after persistence

  Scenario: Change revisions can be loaded with Enter and Space
    Given a browser repository named "Keyboard revision fixture" with an empty file "notes.txt"
    When I type "a" into the code document
    And I type "b" into the code document
    And I type "c" into the code document
    Given selectable earlier and latest change revisions are recorded
    When I open the version history graph
    And I activate the recorded "earlier" change with "Enter"
    Then the recorded "earlier" change is current without leaving History
    And the code document contains "a" after persistence
    When I activate the recorded "latest" change with "Space"
    Then the recorded "latest" change is current without leaving History
    And the code document contains "abc" after persistence

  Scenario: Divergent edits retain their Git connections and current marker after reload
    Given a browser repository named "Graph fixture" with an empty file "notes.txt"
    When I type "a" into the code document
    And I type "b" into the code document
    Given the latest change graph revision and its parent are recorded
    When I undo the latest editor transaction
    Then the code document contains "a" after persistence
    When I type "x" into the code document
    Then the code document contains "ax" after persistence
    When I open the version history graph
    Then the change graph connects the current and retained revisions to their shared parent
    When I reload the version history graph
    Then the change graph restores its connections and current marker
    And the change graph keeps its connected rows aligned in wide and narrow viewports

  Scenario: Changed line summaries follow saved Git revisions and survive reload
    Given a browser repository named "Line graph fixture" with an empty file "notes.txt"
    When I replace the code document with:
      """
      one
      two
      three
      four
      five
      six
      """
    Then the current change graph revision for "notes.txt" shows "added lines 1–6"
    When I replace code line 2 with "TWO"
    Then the current change graph revision for "notes.txt" shows "line 2"
    When I replace the code document with:
      """
      one
      TWO
      THREE
      four
      FIVE
      six
      """
    Then the current change graph revision for "notes.txt" shows "lines 3, 5"
    When I delete code line 4
    Then the current change graph revision for "notes.txt" shows "deleted line 4"
    When I open the version history graph
    Then all recorded change graph line summaries are visible
    When I reload the version history graph
    Then all recorded change graph line summaries are visible

  Scenario: Long edit histories and multiline source commits use only the History scrollbar
    Given a browser repository named "Scrolling graph fixture" with an empty file "notes.txt"
    And a source commit fixture has long multiline details
    When I create separate graph test edits for "abcdefghijklmnopqrstuvwxyz"
    When I open the version history graph
    Then long history graphs scroll only the History panel at wide and narrow sizes

  Scenario: Scoped commit prefixes become split pills while message formatting is preserved
    Given a browser repository named "Commit prefix fixture" with an empty file "notes.txt"
    And source commit fixtures include scoped and ordinary messages
    When I open the version history graph
    And I select the history graph "Commit history"
    Then scoped commit pills preserve their type scope and multiline message
    And all commit pill parts use the same typography
    And commit pill text stays vertically centered at wide and narrow sizes
    And long commit scopes fit a narrow viewport without horizontal scrolling

  Scenario: Commit Markdown renders structure and tags without executing embedded content
    Given a browser repository named "Markdown commit fixture" with an empty file "notes.txt"
    And a source commit fixture contains Markdown and untrusted content
    When I open the version history graph
    And I select the history graph "Commit history"
    Then the commit message renders Markdown structure and distinguishes headings from tags
    And embedded commit content cannot execute scripts or load images

  Scenario: Following a Markdown link does not load its private change revision
    Given a browser repository named "Markdown link fixture" with an empty file "[reference](https:example.invalid).md"
    When I type "abc" into the code document
    And I open the version history graph
    Then a link in an earlier change opens separately without restoring that change
    And the code document contains "abc" after persistence
