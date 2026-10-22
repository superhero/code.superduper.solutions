# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@scroll-minimap
Feature: Minimap navigation across three editor panes
  Scenario Outline: Minimap keys follow scroll preferences independently in all three panes
    Given a browser repository named "Minimap keys" with an empty file "main.js"
    When I fill the primary pane with long split-test source
    And I set minimap scroll speed to <speed> with smoothing <smoothing> and motion <motion>
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then minimap navigation keys honor those preferences in all three panes

    Examples:
      | speed | smoothing | motion |
      | 0.25  | disabled  | normal |
      | 5     | disabled  | normal |
      | 0.25  | enabled   | normal |
      | 5     | enabled   | normal |
      | 5     | enabled   | reduced |

  Scenario Outline: Minimap pointer gestures remain isolated and stop when released
    Given a browser repository named "Minimap gestures" with an empty file "main.js"
    When I fill the primary pane with long split-test source
    And I set minimap scroll speed to <speed> with smoothing <smoothing> and motion normal
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then minimap clicks and continued drags navigate each pane independently

    Examples:
      | speed | smoothing |
      | 0.25  | disabled  |
      | 5     | enabled   |

  Scenario: A short scrollable document keeps its minimap viewport aligned while dragging
    Given a browser repository named "Short minimap" with an empty file "main.js"
    When I fill the primary pane with short scrollable minimap source
    And I set minimap scroll speed to 1.5 with smoothing disabled and motion normal
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then short document minimap drags keep the viewport beneath the pointer in all three panes
    And toggling minimaps preserves three independent scroll positions and wheel navigation

  Scenario Outline: Clicking a logical minimap row locates wrapped code independently in three panes
    Given a browser repository named "Wrapped minimap" with an empty file "main.js"
    When I fill the primary pane with wrapped minimap source
    And I set minimap scroll speed to 1.5 with smoothing <smoothing> and motion normal
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then clicking a wrapped minimap row reveals that logical line in each pane

    Examples:
      | smoothing |
      | disabled  |
      | enabled   |
