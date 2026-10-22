# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@search-panel
Feature: Aligned search footer controls
  Scenario: Chevron switches and their icons align with the Find field
    Given a browser repository named "Search footer alignment" with an empty file "main.js"
    When I type "const search = true;" into the code document
    Then the Find footer controls share a vertical center and Replace aligns below Find
