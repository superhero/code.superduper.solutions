# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Application diagnostics
  Scenario Outline: Error severity preserves the original exception and context
    Then a "<level>" diagnostic keeps the native error stack cause and context
    Examples:
      | level     |
      | error     |
      | critical  |
      | alert     |
      | emergency |

  Scenario Outline: Other messages retain their console severity
    Then a "<level>" message uses the "<method>" console method
    Examples:
      | level | method |
      | info  | log    |
      | warn  | warn   |
      | error | error  |

  Scenario: Scoped diagnostics identify their subsystem
    Then scoped diagnostics preserve their subsystem and original error

  Scenario Outline: Unscoped diagnostics do not invent scope or messages
    Then an "<variant>" logger reports only its original error
    Examples:
      | variant        |
      | explicitly     |
      | metadata       |
