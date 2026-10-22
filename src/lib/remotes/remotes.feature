# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@upstream-adapters
Feature: Optional upstream clients and scoped transport
  Scenario Outline: The <provider> SDK supports the complete owned upstream workflow
    Then the "<provider>" adapter maps reads and explicit writes using only injected fixtures
    Examples:
      | provider  |
      | github    |
      | gitlab    |
      | bitbucket |

  Scenario: API credentials never leave their configured origin or follow redirects
    Then upstream API transport pins authentication and bounds response bodies

  Scenario: Git transport rejects requests outside the selected repository
    Then Git transport prevents cross-repository credentials and unreviewed receive-pack requests

  Scenario: Remote URL and reference validation reject ambiguous or secret-bearing inputs
    Then upstream input validation rejects unsafe hosts remotes and reference names

  Scenario: Remote error messages never retain access tokens
    Then upstream failures provide bounded redacted actionable messages
