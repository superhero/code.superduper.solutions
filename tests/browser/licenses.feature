# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Notices in the standalone page
  Scenario: Full license notices remain readable without appearing in the editor
    Then the browser retains the complete license notices in an inert template
    And the page has its application title and an accessible editor shell
    And the application makes no runtime asset requests

  Scenario: Markup in an upstream notice cannot execute or request resources
    Then markup-like notice text stays inert when parsed by the browser
    And the application makes no runtime asset requests
