# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@development @loading-gallery
Feature: Show real startup work with orderly loading animations
  Scenario: Nine loading stages fit together and report completed or unnecessary work
    Given loading gallery motion is enabled
    Then the loading gallery has its brand header and animated loading footer without controls
    And all nine loading stages fit in the desktop viewport
    And the preview reports resolved startup work and skips an absent repository
    And each loading animation uses its authored cycle duration
    And every loading alternative visibly changes over time
    And a desktop loading gallery preview is saved

  Scenario: Compact loading follows real repository and document work before reporting readiness
    When I open the editor from the pinned loading preview
    Given I import a workspace fixture named "Loading progress workspace"
    When I open the repository file "alpha.txt"
    Given the next preview holds metadata and active file reads separately
    When I reload into the compact pinned loading preview
    Then the compact loading preview shows the pending repository work
    And pending loading titles stay hidden until their work starts
    When I release the preview metadata reads
    Then the compact loading preview advances to preparing the active file
    And started loading titles appear without moving their drawings
    When I release the preview active file reads
    Then the loading preview reports the saved editor and workspace ready
    And completed loading stages retain only their titles without changing the layout

  Scenario: The gallery fits compact and roomy viewports without scrolling
    Given reduced motion is preferred in the loading gallery
    Then the loading gallery fits these viewport sizes without scrolling
      | width | height | cards |
      | 390   | 844    | 6     |
      | 768   | 1024   | 8     |
      | 390   | 699    | 4     |
      | 390   | 700    | 6     |
      | 390   | 899    | 6     |
      | 390   | 900    | 8     |
      | 390   | 1200   | 8     |
      | 390   | 699    | 4     |
      | 1024  | 600    | 9     |
      | 1024  | 480    | 4     |
      | 1024  | 481    | 9     |
      | 1024  | 650    | 9     |
      | 1024  | 651    | 9     |
      | 844   | 390    | 4     |
      | 320   | 480    | 4     |
      | 320   | 240    | 4     |
      | 900   | 900    | 8     |
      | 901   | 900    | 9     |
      | 1280  | 720    | 9     |
      | 1280  | 900    | 9     |
    And the loading alternatives have no running animations

  Scenario: Preference icons highlight while processing and remain green afterward
    Given loading gallery motion is enabled
    Then preference animation icons highlight in order and retain their completed color


  Scenario: Each loading drawing holds at its own completed action boundaries
    Then the nine loading drawings hold completed actions while retaining movement speed

  Scenario: Typing starts immediately and completed history draws a ring during its longer hold
    Then typing starts without waiting and the final commit is circled during its finished hold

  Scenario: Hover reveals a bouncing title and brightens unfinished panes without shifting drawings
    Then loading pane hover reveals and drops its title while preserving drawing geometry
