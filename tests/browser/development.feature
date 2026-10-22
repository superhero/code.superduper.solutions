# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@development
Feature: Development diagnostics
  Scenario: The development app mounts without exposing developer tools by default
    Then the developer toolbar is hidden by default

  Scenario: Developer tools can be explicitly enabled
    When I enable developer tools through the development URL
    Then the developer toolbar is visible

  Scenario: Opening a second development page preserves the first toolbar
    When I enable developer tools through the development URL
    And I open a second development page
    Then each page has one toolbar and the first toolbar retains its identity

  Scenario: Restarting the development server restores a usable toolbar
    When I enable developer tools through the development URL
    And the isolated development server restarts
    Then the reloaded page has one usable toolbar

  Scenario: Native exceptions retain actionable source locations
    When the isolated development fixture throws a native error
    Then one error overlay displays the native fixture source
    And the overlay locks page scrolling without shifting the page content
    And dismissing the overlay restores page scrolling and its original gutter

  Scenario: Logged errors reach the overlay without losing their cause
    When the isolated development fixture logs an error with a cause
    Then one error overlay displays the logged error and its cause

  Scenario: A primitive rejection is normalized without a fabricated stack
    When the isolated page reports a primitive rejection
    Then one error overlay explains the primitive rejection without invented source frames

  Scenario: A Vite reload drains accepted rapid typing before replacing the page
    Given a browser repository named "Development reload fixture" with an empty file "notes.txt"
    And the current edit and source Git histories are recorded
    When I rapidly type "abcdefghijklmnopqrstuvwxyz0123456789ABCD" and Vite requests a page reload
    Then the open file tab "notes.txt" is selected
    When I open the repository file "notes.txt"
    Then the code document contains "abcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged

  Scenario: A Vite hot update drains accepted rapid typing without replacing the page
    Given a browser repository named "Development update fixture" with an empty file "notes.txt"
    And the current edit and source Git histories are recorded
    When I rapidly type "abcdefghijklmnopqrstuvwxyz0123456789ABCD" and Vite updates the stylesheet
    Then the code document contains "abcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
