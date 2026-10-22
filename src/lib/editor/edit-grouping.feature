# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@edit-grouping
Feature: Continuous row edits form deliberate history steps
  Scenario: Adjacent typing and deletion share one short edit session
    Then contiguous typing composition and deletion keep the same row edit group

  Scenario Outline: Interaction boundaries start a new edit session
    Then a row edit group ends on "<boundary>"
    Examples:
      | boundary          |
      | pause             |
      | cursor move       |
      | document change   |
      | focus loss        |
      | paste             |
      | format            |
      | line break        |
      | row change        |
      | selection replace |
      | multiple cursors  |

  Scenario: The worker validates the real changed row
    Then single row detection rejects multiline edits and preserves CRLF row numbers
