# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@npm-types-live
Feature: Real public npm declaration packages
  Scenario Outline: Real <package> declarations remain useful offline
    Given the "typescript" language intelligence repository is imported
    And the public npm registry is available for declaration installation
    When I install and activate its language engine
    And I install the "<package>" npm declarations
    Then the "<package>" declarations provide an offline editor completion
    Examples:
      | package        |
      | @types/react   |
      | @types/express |
      | svelte         |
