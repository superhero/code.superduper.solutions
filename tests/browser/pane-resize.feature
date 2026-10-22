# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@pane-resize
Feature: Resize independently shared right panes
  Scenario Outline: History and Git remain draggable after reopening a crowded dock with <motion> motion
    Given a browser repository named "Crowded dock" with an empty file "main.js"
    And a source commit fixture named "Current source commit" records the current repository
    When I request a new branch named "feature/same-tip"
    Then the active branch is "feature/same-tip"
    And crowded History and Git panes remain draggable after inspecting the current commit with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |
