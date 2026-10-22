# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@history-retention
Feature: Startup compacts automatic changes independently per file
  Scenario: Reload applies the per-file budget while retaining the current documents
    When I import a directory with a nested file tree
    Then startup retains two automatic changes for each edited file
