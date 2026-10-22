# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Changed Git revision line ranges
  Scenario: Unchanged text has no changed lines
    Then unchanged file contents have no changed line ranges

  Scenario: Distant edits preserve unchanged lines between them
    Then separate line replacements remain separate changed ranges

  Scenario: Insertions and deletions use the correct revision's line numbers
    Then added and removed lines belong only to their respective revision

  Scenario: Empty files and trailing newlines do not invent phantom rows
    Then empty files and EOF newline edits report only real lines

  Scenario: CRLF, lone CR and Unicode text retain their original line boundaries
    Then CRLF, lone CR and Unicode changes have accurate line ranges

  Scenario: Repeated lines preserve an optimal unchanged subsequence
    Then repeated line edits preserve the maximum unchanged lines

  Scenario: Large files with sparse edits keep small distinct ranges
    Then sparse edits in a large file remain distinct without a quadratic table
