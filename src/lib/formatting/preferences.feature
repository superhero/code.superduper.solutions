# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Formatter choices belong to users
  Scenario: Only supported language and provider combinations survive normalization
    Then formatter selections reject incompatible unknown and unsafe entries
  Scenario: Repository choices inherit individual languages from personal defaults
    Then repository formatter overrides merge by language and can disable formatting
  Scenario: Recommendations do not change selected defaults
    Then recommendations prefer official support and compare measured peers without changing choices
  Scenario: Routing preserves syntax-specific filename and language behavior
    Then formatter routing retains script dialects templates and existing defaults
