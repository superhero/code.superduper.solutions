# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@development
Feature: Recovery of an interrupted browser repository transaction
  Scenario Outline: Recovery after <stage> applies one durable edit exactly once
    When a repository edit is interrupted at "<stage>" and the storage service reopens
    Then recovery restores the accepted file and exactly one Git history commit
    And recovery retains undo and redo without changing source commits
    Examples:
      | stage         |
      | prepared      |
      | files-flushed |
      | refs-flushed  |
      | finalized     |
