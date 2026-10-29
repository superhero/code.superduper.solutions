# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@assistant-design @development
Feature: Assistant controls follow the surrounding Settings design
  Scenario Outline: Model summaries use the full settings width
    Then model settings summaries fit in "<mode>" mode at <width> pixels
    Examples:
      | mode | width |
      | dark | 1280  |
      | light | 1280 |
      | dark | 620   |
      | light | 620  |

  Scenario: Speech loading and loaded rows retain the shared model presentation
    Then speech model preparation has shared progress and readable compact model controls

  Scenario: Speech and language failures share recovery styling
    Then speech and language model errors use the same divided alert layout

  Scenario: Dictation preparation provides progress without crowding the toolbar
    Then the dictation footer shows loading progress and preserves its draft when cancelled

  Scenario: New local AI profiles reuse the shared model controls
    Then the LFM3 and Phonon profiles expose consistent settings and dictation choices

  Scenario: Phonon exposes the GPU streaming prerequisites and limits
    Then the Phonon settings show GPU streaming compatibility and retain the shared model layout
