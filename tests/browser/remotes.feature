# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@remote-ui
Feature: Install and use upstream integrations
  Background:
    Given a browser repository named "Remote UI fixture" with an empty file "main.js"

  Scenario: Upstream SDKs install explicitly and support export removal and reinstall
    Then upstream libraries install only on request and preserve verified package controls

  Scenario: Connections require an installed and current provider integration
    Then connection creation follows provider installation and blocks outdated integration drafts

  Scenario: Remembered upstream credentials are encrypted and stay outside editing histories
    Given the current edit and source Git histories are recorded
    Then an upstream connection remembers only encrypted credentials and unlocks after reload
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario Outline: Hosted collaboration uses the installed <provider> library
    Then the "<provider>" connection supports hosted requests issues and checks with intercepted APIs
    Examples:
      | provider  |
      | github    |
      | gitlab    |
      | bitbucket |

  Scenario: Full-history cloning and remote synchronization use the browser worker
    Then browser cloning fetch and pull use only the local Git transport fixture

  Scenario Outline: The <provider> clone browser prepares upstream repositories and forks
    Given the current edit and source Git histories are recorded
    Then the "<provider>" clone browser finds creates and forks repositories with intercepted APIs
    And the edit Git history is unchanged
    And the source Git history is unchanged
    Examples:
      | provider  |
      | github    |
      | gitlab    |
      | bitbucket |

  Scenario: Known clone prerequisites prevent Git requests and link directly to configuration
    Then GitHub cloning is blocked until a matching relay connection is selected

  Scenario: Invalid clone input uses a field outline instead of validation paragraphs
    Then invalid clone input has a dark red outline that clears when corrected

  Scenario: Locked clone connections link directly to unlocking before any transfer
    Then a locked clone connection must be unlocked through the guided settings action
