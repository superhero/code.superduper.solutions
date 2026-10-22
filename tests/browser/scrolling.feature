# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Editor scroll preferences
  Scenario: Scroll speed and smoothing apply live, persist, and respect reduced motion
    Given a browser repository named "Scrolling" with an empty file "main.js"
    Then editor wheel distance follows the scroll speed slider
    And editor smooth scrolling eases movement and respects reduced motion
    And editor smoothing tolerates wheel events after the frame timestamp
    And editor non-smoothed scrolling stays stable near document edges
    And editor wheel reversals respond immediately near both document edges
    And editor scrolling preferences survive reload

  Scenario: Backgrounding the application flushes scrolling in every pane immediately
    Given a browser repository named "Background scrolling" with an empty file "main.js"
    When I fill the primary pane with long split-test source
    And I open tab "main.js" in split view
    Then backgrounding the application saves each pane before the scroll idle timeout

  @split-wheel
  Scenario: Non-smoothed scrolling at one and a half speed stays stable in every pane
    Given a browser repository named "Immediate split scrolling" with an empty file "main.js"
    When I fill the primary pane with long split-test source
    And I disable smoothing and set scroll speed to one and a half
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then immediate wheel scrolling stays stable in every editor pane
    And saving a split scroll position does not restart its syntax rendering
    And fine wheel movements accumulate at the configured scroll speed in every pane
