# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Recoverable browser speech lifecycle
  Scenario: An unisolated page stops before downloads or worker startup
    Given speech input is opened without cross-origin isolation
    When I initialize the cached model
    Then speech reports the required secure isolation headers without starting a worker

  Scenario: Startup deadline terminates the blocked worker
    Given a speech worker blocked while compiling the encoder
    When 120 seconds elapse
    Then speech startup fails with its last stage and the worker is terminated
    And no automatic retry occurs
    When I manually retry speech startup
    Then a fresh worker initializes successfully

  Scenario: Cached reload restores models without installing them again
    Given a newly opened controller with a complete CPU speech cache
    When I initialize the cached model
    Then the cached URLs are used without another download

  Scenario: Repeated dictation keeps each draft without saving recordings
    Given a ready speech controller
    When I record and stop two conversations in sequence
    Then each draft receives only its own finalized words
    And no recording audio or transcript is saved separately

  Scenario: Permission denial permits clean manual recovery
    Given a ready speech controller whose microphone permission is denied
    When I request dictation
    Then the capture is closed and the failure is recoverable
    When I retry after granting microphone access
    Then dictation can start and stop successfully

  Scenario: A late microphone grant is released after cancellation
    Given a ready speech controller waiting for microphone permission
    When I cancel dictation before permission is granted
    Then a late permission response cannot start recording

  Scenario: Cancelled restoration cannot revive an unloaded model
    Given cached model restoration is still pending
    When I cancel model initialization
    Then the late restored URLs are revoked and no worker starts
