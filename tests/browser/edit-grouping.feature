# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@edit-grouping
Feature: Editing sessions group History and Undo consistently across views
  Background:
    Given a browser repository named "Typing groups" with an empty file "notes.txt"

  Scenario Outline: A typing session is one durable step in each editable view
    When I type a continuous row session in the "<view>" view
    Then the row session has one history entry and one durable Undo and Redo step
    Examples:
      | view       |
      | editor     |
      | split      |
      | diff       |
      | split diff |

  Scenario Outline: Closing a focused diff preserves the grouped edit without render-time callbacks
    When I type a continuous row session in the "<view>" view
    And I close the focused typing-session diff
    Then its editor keeps the grouped content without another history entry
    Examples:
      | view       |
      | diff       |
      | split diff |

  Scenario Outline: Browser interactions end the current row session
    When I separate two typing sessions with "<boundary>"
    Then Undo restores only the second typing session
    Examples:
      | boundary    |
      | pause       |
      | cursor move |
      | focus loss  |
      | paste       |
      | new row     |
      | reload      |
