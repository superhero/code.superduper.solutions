# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Formatting edits preserve editor coordinates
  Scenario: Formatting maps a selected identifier across whitespace changes
    Then a formatting transaction preserves the selected identifier

  Scenario: Formatting preserves CRLF without corrupting positions
    Then formatting normalized output retains the document line separator

  Scenario: An already formatted document produces no edit
    Then identical formatting output produces no changes
