# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@staging-performance
Feature: Index updates preserve the mounted workspace
  Scenario: Staging and unstaging update the index without reopening working documents
    Given a populated staging performance workspace
    Then repeated index updates preserve the workspace and report their costs
