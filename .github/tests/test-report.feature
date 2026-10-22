# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@automation
Feature: Publish a complete standalone report of the Cucumber suites

  Scenario: A bundled report retains every suite and its interactive feature pages
    Given Cucumber results from source, acceptance, browser, and automation suites
    When the standalone test report is generated
    Then the report embeds all suite results, feature pages, scripts, styles, and fonts
    And the standalone report preserves its first-party wrapper notices
    And the standalone report embeds full legal notices for "tests"
    And charts are omitted while table, scenario, attachment, and theme initialization remains usable

  Scenario: A bundled coverage report preserves its first-party wrapper notices
    Given a coverage report with an overview and a source page
    When the standalone coverage report is generated
    Then the standalone report preserves its first-party wrapper notices
    And the standalone report embeds full legal notices for "coverage"
    And the coverage artifact retains its original report pages

  Scenario: A partial diagnostic report visibly identifies a failed CI run and missing suites
    Given Cucumber results from source, acceptance, browser, and automation suites
    And browser results were not produced by a failed CI run
    When the standalone test report is generated
    Then the diagnostic report displays its failure warning as text

  Scenario Outline: Invalid inputs cannot leave a stale successful test report
    Given Cucumber results from source, acceptance, browser, and automation suites
    And the acceptance report is "<problem>"
    When the standalone test report is generated
    Then report generation fails with input and output context and removes any stale HTML

    Examples:
      | problem        |
      | missing        |
      | malformed JSON |
      | empty          |
      | invalid shape  |
