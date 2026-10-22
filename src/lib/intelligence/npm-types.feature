# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@npm-types
Feature: Browser-only npm declarations
  Scenario: npm search finds community and included declarations without deprecated stubs
    Then npm type search filters results and identifies included declarations
  Scenario: Declaration installs resolve dependencies and peers without retaining executable files
    Then npm type installation verifies archives and retains declarations and notices only
  Scenario: Declaration installation ignores runtime-only dependencies and imports in documentation
    Then npm types fetch only dependencies used by declarations
  Scenario: Reviewed missing-notice supplements require their exact release license and archive
    Then npm type notice supplements match only their reviewed package identity
  Scenario Outline: Invalid npm archives fail before installation
    Then npm type installation rejects "<failure>"
    Examples:
      | failure             |
      | corrupt integrity   |
      | external tarball    |
      | unsafe path         |
      | truncated archive   |
      | deprecated stub     |
      | no declarations     |
      | missing license     |
      | inconsistent name   |
      | archive identity    |
  Scenario: Cancelled requests do not download or process dependencies
    Then npm type installation respects cancellation
  Scenario: npm preference names cannot introduce malformed or prototype keys
    Then npm type preferences validate names and inherit explicitly
