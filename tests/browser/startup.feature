# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@startup
Feature: Show loading until the saved workspace is ready
  @development
  Scenario: Development startup resolves the upstream catalog and opens the workspace
    Then the startup screen is removed and the application is available
    And Settings lists all upstream integrations without downloading their libraries

  Scenario: The standalone HTML shows an accessible loading screen before application scripts run
    Given interface motion is enabled
    When I reload with application scripts disabled
    Then the startup screen covers the viewport and keeps the application inactive
    And the startup screen contains a loading stage
    And all nine startup drawings are visible and animated before JavaScript runs
    And startup drawings fit compact screens before JavaScript runs
    Given reduced motion is preferred during startup
    Then the startup screen has no running animation

  @development
  Scenario: The first painted loading drawings continue unchanged when the application starts
    Given interface motion is enabled
    And the next startup storage reads are held
    When I reload while the application entry module is held
    Then the startup screen covers the viewport and keeps the application inactive
    When I release the application entry module
    Then the startup storage reads are pending
    And startup hydration preserves the original drawings and their animation timelines
    When I release the startup storage reads
    Then the startup screen is removed and the application is available
    And ready pane backgrounds finished fading in order before the workspace appeared

  Scenario: A held startup keeps the saved appearance and reveals only the restored workspace
    Given interface motion is enabled
    And I import a workspace fixture named "Startup workspace"
    When I open the repository file "beta.txt"
    And I open the repository file "alpha.txt"
    And I choose the saved startup appearance through Settings
    And I select and scroll a long workspace document
    Given the next startup storage reads are held
    When I reload into the startup screen
    Then the startup storage reads are pending
    And the startup screen covers the viewport and keeps the application inactive
    And the startup cards report work still waiting for storage
    And the startup screen has a running loading animation
    And the pending startup uses the saved appearance
    When I release the startup storage reads
    Then the startup screen is removed and the application is available
    And the workspace tabs are "beta.txt, alpha.txt" with "alpha.txt" active
    And the workspace document selection and scroll position are restored
    And the first startup reveal already contained the restored document position

  Scenario: A startup storage failure releases the loading screen to usable error controls
    Given the next startup repository read fails
    When I reload into the startup screen
    Then the startup screen is removed and the application is available
    And the startup storage failure is explained
    And repository recovery controls remain usable

  Scenario: Reduced motion disables loading animation while storage is pending
    Given reduced motion is preferred during startup
    And the next startup storage reads are held
    When I reload into the startup screen
    Then the startup storage reads are pending
    And the startup screen covers the viewport and keeps the application inactive
    And the startup screen has no running animation
    When I release the startup storage reads
    Then the startup screen is removed and the application is available

  @development
  Scenario: Hot replacing the application preserves the current document and workspace
    Given I import a workspace fixture named "Startup hot replacement"
    When I open the repository file "beta.txt"
    And I open the repository file "alpha.txt"
    And I select and scroll a long workspace document
    When the development application is hot replaced
    Then the startup screen is removed and the application is available
    And the workspace tabs are "beta.txt, alpha.txt" with "alpha.txt" active
    And the workspace document selection and scroll position are restored
    And the workspace document has keyboard focus
    And the development application kept the same document
