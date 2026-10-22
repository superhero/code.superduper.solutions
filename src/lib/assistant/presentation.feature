# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ai-presentation-source
Feature: AI generation metadata
  Scenario Outline: Generation duration uses the permitted units for <milliseconds> milliseconds
    Then a generation taking <milliseconds> milliseconds is shown as "<label>"

    Examples:
      | milliseconds | label     |
      | 0            | 0ms       |
      | 999          | 999ms     |
      | 1000         | 1s        |
      | 4999         | 4s 999ms  |
      | 5000         | 5s        |
      | 59999        | 59s       |
      | 60000        | 1m        |
      | 3599999      | 59m 59s   |
      | 3600000      | 1h        |
      | 3661000      | 1h 1m     |
      | 90061000     | 1d 1h 1m  |

  Scenario: Invalid generation durations cannot appear in message metadata
    Then non-finite generation durations are rejected
