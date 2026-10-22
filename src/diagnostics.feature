# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Runtime error diagnostics
  Scenario: Existing errors retain their identity and stack
    Then normalizing a native exception preserves its identity stack and cause

  Scenario Outline: Primitive rejections remain inspectable without invented frames
    Then a rejected "<value>" retains its original value and a useful message
    Examples:
      | value     |
      | zero      |
      | false     |
      | null      |
      | undefined |
      | string    |
      | bigint    |

  Scenario: A browser error without details remains truthful
    Then a browser error without details has no fabricated stack

  Scenario: Browser-supplied locations remain actionable
    Then an error location retains its filename line and bounded column

  Scenario: Structured exceptions preserve their diagnostic fields
    Then structured errors preserve custom names codes and existing stacks

  Scenario: Circular rejection data remains inspectable
    Then circular rejection data retains useful fields without crashing

  Scenario: Throwing accessors cannot break error normalization
    Then hostile diagnostic accessors do not escape normalization

  Scenario: Resize observer events explain missing callback stacks
    Then a resize observer error explains deferred notifications without inventing a stack

  Scenario: Native codes survive overlay serialization
    Then remembered error chains restore codes omitted by serialization

  Scenario: Ambiguous matching chains do not invent a code
    Then conflicting remembered error codes remain unresolved

  Scenario: Serialized codes take precedence over remembered codes
    Then explicit serialized error codes take precedence

  Scenario: Previously resolved chains remain stable
    Then resolving the same error array retains its cached identity

  Scenario: Cyclic error causes are bounded
    Then cyclic cause chains remain bounded

  Scenario: Excessive cause-chain depth is bounded
    Then long cause chains retain only the first fifty identities

  Scenario: Missing cause chains produce no invented identities
    Then an empty cause chain resolves to no identities

  Scenario Outline: Invalid code fields are not promoted into error identities
    Then the invalid "<code>" error code is omitted
    Examples:
      | code     |
      | empty    |
      | nan      |
      | infinity |
      | object   |
      | false    |
      | null     |
