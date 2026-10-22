# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@resources-view
Feature: Browser resource monitoring
  Scenario: Resources adapts the browser dashboard without changing repository files or history
    Given a browser repository named "Resource checks" with an empty file "notes.txt"
    When I type "const answer = 42;" into the code document
    Given the current edit and source Git histories are recorded
    Then browser resource cards charts and database counts are readable and responsive
    And the edit Git history is unchanged
    And the source Git history is unchanged
    When I choose the workspace page "Editor"
    Then the code document contains "const answer = 42;" after persistence

  Scenario: Unavailable APIs are explained without fabricated measurements
    Then unavailable browser resource APIs are shown honestly

  Scenario: Storage denial does not hide independently available information
    Then failed storage estimates preserve persistence information in Resources

  Scenario: Full page memory is measured only on request
    Then page memory is manual and displays aggregate categories without attribution

  Scenario: Monitoring releases observers and suppresses overlapping or hidden samples
    Then browser monitoring pauses stops and shares unfinished requests

  Scenario: A database disappearing during inspection cannot be recreated
    Then resource database inspection never creates a missing database

  Scenario: Live monitoring has bounded observable page overhead
    Then live and paused resource monitoring report page rendering costs

  @development
  Scenario: Long history compresses older readings into CSS pixel columns
    Then logarithmic resource history retains recent detail and readable labels after resizing

  Scenario: Persistent storage is requested and warnings follow the browser decision
    Then persistent storage is requested once and warnings reflect its actual status

  Scenario: Resources chart has no duplicate metric summary
    Then the Resources chart shows its title and metric picker without a summary row
