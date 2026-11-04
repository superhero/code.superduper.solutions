# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Inference review contracts in the editor
  Scenario: Parser errors survive fragmented native calls and reach the real Pi hook
    Then fragmented invalid native calls cannot execute an editor tool
  Scenario: Concurrent release waits for one teardown before relinquishing ownership
    Then model release shares its native disposal and retains ownership until completion
  Scenario: Unconfirmed native release blocks subsequent allocation
    Then failed native cleanup retains its resources and blocks another model
  Scenario: Failed load cleanup cannot trigger an allocation fallback
    Then a native load cleanup failure prevents further allocation attempts
  Scenario: A decision factory preserves partial-load cleanup failure
    Then native decision loading reports unconfirmed cleanup instead of discarding it
  Scenario: Repeated worker disposal retains the same failure
    Then concurrent worker cleanup waits for one reply and preserves disposal failure
  Scenario: Aborting a worker load settles it immediately
    Then worker load cancellation terminates its owned worker once
  Scenario: Vision uses the selected profile output budget
    Then compatible image tools pass their 128 token budget to loading and generation
  Scenario: Cancellation during cleanup cannot return successful observations
    Then late image cancellation shares cleanup and cannot restart text
