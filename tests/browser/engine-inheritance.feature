# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Repository language engines inherit personal choices
  Scenario: Repository language engine choices can return to inherited defaults
    Given a browser repository named "Engine inheritance" with an empty file "notes.json"
    Then repository engine choices inherit defaults and can clear explicit overrides
