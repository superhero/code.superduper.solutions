# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Continuous speech cleanup and unarchived audio ownership
  Scenario: Repeated cancellation shares cleanup before loading another worker
    Given a loaded speech controller with a gated microphone close
    When I cancel twice and reload before microphone cleanup finishes
    Then one teardown completes before a usable replacement worker loads

  Scenario: A segment failure cannot tear down a replacement worker
    Given a loaded speech controller with a gated microphone close
    When a segment fails and I reload before microphone cleanup finishes
    Then the failure is reported once and replacement resources survive

  Scenario: Unarchived recovery audio survives another recording
    Given a loaded speech controller whose archive rejects writes
    When a captured core cannot be archived and I start another recording
    Then the earlier PCM remains recoverable until explicitly discarded
