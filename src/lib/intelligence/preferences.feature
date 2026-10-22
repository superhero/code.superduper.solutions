# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Explicit language engine activation
  Scenario: All engines begin disabled and invalid selections are discarded
    Then language engines require a compatible explicit selection
  Scenario: Repository choices inherit independently and cannot leak into file settings
    Then language engine preferences merge by language and preserve explicit disabling
  Scenario: Additional type libraries require opt-in and respect repository inheritance
    Then type library settings default off and merge without leaking into file overrides
