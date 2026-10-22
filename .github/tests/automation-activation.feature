# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Repository automation activation
  Validation remains available while remote publication is explicitly disabled.

  Scenario Outline: Publication is disabled until explicitly enabled
    Given the repository automation activation value is "<value>"
    Then every publication job and documentation write is disabled
    And ordinary pull requests still run validation

    Examples:
      | value   |
      | missing |
      | false   |

  Scenario: Explicit activation retains the release and merge workflows
    Given the repository automation activation value is "true"
    Then eligible publication jobs and documentation writes are enabled

  Scenario Outline: Application checks survive disabled changelog preparation
    Given the repository automation activation value is "missing"
    When workflow validation is "<workflow>" and branch validation is "<branch>"
    Then application validation is "<outcome>" with changelog preparation skipped

    Examples:
      | workflow | branch    | outcome  |
      | success  | success   | enabled  |
      | failure  | success   | disabled |
      | success  | failure   | disabled |
      | skipped  | success   | disabled |
      | success  | cancelled | disabled |

  Scenario: Every external write has an activation boundary
    Then every credential grant and publication command has an activation guard
    And publication destinations belong to the code editor
