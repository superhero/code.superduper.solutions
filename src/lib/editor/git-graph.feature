# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@git-graph
Feature: Git history graph layout
  Scenario: Branch count labels expand only their own path and nested controls
    Then branch labels independently expand their paths and nested junctions without inventing ancestry

  Scenario: Collapsed history keeps the selected mainline and leaves all forks intact
    Then collapsed ancestry follows the selected first parent without changing retained history

  Scenario: Linear changes connect their actual parents in one lane
    Then a linear Git graph traces every parent in a single lane

  Scenario: Retained changes after undo fork at their shared ancestor
    Then divergent Git futures meet only at their real common ancestor

  Scenario: Merge commits connect both parents without dropping either ancestry
    Then a Git merge graph traces both parent paths back to their shared root

  Scenario: Missing and invalid parents do not connect unrelated changes
    Then a partial Git graph stops at missing parents and ignores backwards edges

  Scenario: Hidden snapshots preserve connections to visible ancestors
    Then a scoped Git graph connects projected ancestors without changing actual parents

  Scenario: Forks from a hidden starting state share a nonselectable junction
    Then scoped Git forks meet at their certified hidden baseline without joining unrelated roots

  Scenario: Finished lanes are reused without moving continuing branches
    Then a Git graph reuses empty lanes while retaining continuous parent paths

  Scenario: Empty history has no graph rows or lanes
    Then an empty Git graph has no rows or lanes

  Scenario: Layout preserves the supplied records and ordering
    Then Git graph layout leaves frozen history unchanged and is deterministic

  Scenario: Long edited line lists show counts instead of explicit line numbers
    Then history line summaries list up to ten lines and count larger changes

  Scenario: Branch message motion stops at the junction and newest revealed timestamp
    Then branch message motion includes intervening commits and leaves newer and older messages alone

  Scenario: Branch message motion uses timestamps instead of list order or lane changes
    Then branch message motion follows dates even when graph rows are not in timestamp order

  Scenario: Collapsing branches uses the same message interval as expanding them
    Then branch message motion has the same bounded scope when opening and closing

  Scenario: A connection-only branch scopes messages to its two dated endpoints
    Then connection-only branch message motion stays between its endpoint timestamps

  Scenario: Branch lines slide together across retained commits
    Then a branch slide includes straight runs across retained commits and excludes their original edges

  Scenario: Connection-only branches slide their vertical run along with their bends
    Then a connection-only branch slide includes its complete vertical run to the existing parent

  Scenario: Expanding a branch preserves already visible branch lines
    Then an added branch slide leaves already expanded branches visible even across newly inserted rows

  Scenario: Branch growth follows a continuous stroke from the junction
    Then branch growth stitches the bend and all row fragments into one stroke from the junction

  Scenario: Nested branch growth waits for the parent junction
    Then nested branch strokes and nodes wait until growth reaches their shared junction

  Scenario: Sibling branch growth keeps separate routes
    Then sibling growth strokes remain separate even when their colors match
