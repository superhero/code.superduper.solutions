# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@scroll-performance
Feature: Scrolling work stays local to the active pane
  Scenario: Single and split scrolling expose comparable resource measurements
    Given a browser repository named "Scroll workload" with an empty file "main.js"
    When I profile scrolling with one two and four editor panes
    Then scrolling does not repaint inactive minimaps or interrupt wheel movement
    And a reload during split scrolling preserves the current viewport
