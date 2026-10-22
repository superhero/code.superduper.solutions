# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@resources
Feature: Bounded browser resource observations
  Scenario: Unsupported browser counters remain unavailable
    Then missing resource APIs return unavailable values rather than zeros

  Scenario: Invalid browser numbers cannot become misleading measurements
    Then resource samples accept only finite nonnegative measurements

  Scenario: Storage failures preserve independent persistence information
    Then a denied storage estimate retains a readable persistence result

  Scenario: Cancelled callers share unfinished native storage requests
    Then resource storage requests do not overlap when a view leaves and reopens

  Scenario: Timed out operations release their caller without cancelling the native request
    Then resource waits time out and abort without keeping their listeners

  Scenario: Long task intervals count blocking time without retaining attribution
    Then processing samples deduplicate tasks reset intervals and disconnect cleanly

  Scenario: Unsupported and failed observers clean up safely
    Then processing observer failures report unavailable measurements

  Scenario: Page memory requires actual browser support
    Then page memory explains missing secure context isolation and API support

  Scenario: Page memory groups omit attribution and share a native measurement
    Then manual page memory measurements group bytes without retaining URLs

  Scenario: Invalid page memory is reported as unavailable
    Then invalid page memory totals do not become zero measurements

  Scenario: Live history retains only a bounded session window
    Then live resource samples retain the latest 1024 observations without mutating inputs

  Scenario: Logarithmic time expands recent detail down to one pixel at the oldest edge
    Then resource time spacing decreases toward the left at every chart width

  Scenario: Dense history preserves spikes and their chronological order
    Then resource pixel columns retain their first last minimum and maximum readings

  Scenario: Unavailable readings remain gaps and expired readings leave the plot
    Then resource history projection preserves gaps zeros and the visible time boundary

  Scenario: Time labels match the compressed scale without overlapping
    Then resource time ticks remain readable across chart widths
