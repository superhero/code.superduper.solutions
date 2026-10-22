# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@folder_paint
Feature: Folder animations repaint the sidebar cleanly
  Scenario: Repeated animated folder collapse restores every sidebar pixel
    Given interface motion is enabled
    When the document uses the "dark" appearance mode
    And I import a deeply nested folder for paint checks
    Given the collapsed sidebar pixels are recorded
    When I expand and collapse the nested folders six times
    Then the folder collapse visibly slides before removing its subtree
    And the collapsed sidebar exactly matches its original pixels
