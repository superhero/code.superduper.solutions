# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@history-performance
Feature: Durable history avoids repeated repository and editor work
  Scenario: Repeated file history preserves live editors and exposes browser resource measurements
    Given a history profiling repository with 100 files and 20 document transactions
    Then repeated undo and redo preserve the live editor and report their resource costs
  Scenario: Rapid undo and redo retain every queued file transaction
    Given a history profiling repository with 10 files and 20 document transactions
    Then rapid history shortcuts restore every transaction in order
