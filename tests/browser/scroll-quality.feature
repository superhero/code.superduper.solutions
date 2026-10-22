# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@scroll-quality
Feature: Scroll settings behave consistently across three editor panes
  Scenario Outline: Every speed works in three panes with smoothing <smoothing> and motion <motion>
    Given a browser repository named "Scroll settings review" with an empty file "main.js"
    When I prepare a wide document for the scroll settings review
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then I review every scroll speed with smoothing "<smoothing>" and motion "<motion>"
    And fine smooth and immediate wheel gestures preserve distance in every pane

    Examples:
      | smoothing | motion        |
      | disabled  | no-preference |
      | enabled   | no-preference |
      | enabled   | reduce        |
      | disabled  | reduce        |

  Scenario: External scrolling and direction changes discard unapplied wheel fractions
    Given a browser repository named "Scroll interruptions" with an empty file "main.js"
    When I prepare a wide document for the scroll settings review
    And I disable smoothing and set scroll speed to one and a half
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then fractional wheel gestures do not leak across scroll interruptions
    When I set minimap scroll speed to 5 with smoothing enabled and motion normal
    Then minimap keys start from an externally restored viewport

  Scenario: The latest wheel gesture wins when changing diff panes during smoothing
    Given a browser repository named "Diff scroll ownership" with an empty file "main.js"
    When I prepare a long file for scrolling the diff
    Given a source commit fixture named "Diff scroll baseline" records the current repository
    When I set minimap scroll speed to 5 with smoothing enabled and motion normal
    And I click the file diff toolbar button
    Then the newest wheel gesture controls both diff viewports

  Scenario Outline: Three panes respect wheel boundaries and reversals at <speed> speed with smoothing <smoothing>
    Given a browser repository named "Three pane scroll edges" with an empty file "main.js"
    When I fill the primary pane with long split-test source
    And I set minimap scroll speed to <speed> with smoothing <smoothing> and motion normal
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    Then all three panes clamp wheel boundaries and reverse without moving their neighbours

    Examples:
      | speed | smoothing |
      | 0.25  | disabled  |
      | 5     | disabled  |
      | 0.25  | enabled   |
      | 5     | enabled   |
