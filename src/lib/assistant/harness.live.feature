# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ai-harness-live
Feature: Real local Ornith through the browser Pi harness adapter
  Scenario: Ornith reads a repository file through Pi and uses the returned value
    Then local Ornith uses Pi to read a file and reports its exact fixture value
