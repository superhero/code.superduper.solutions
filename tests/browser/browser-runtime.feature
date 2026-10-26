# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-ui @development
Feature: Browser inference hands one runtime between queued requests
  Scenario: Choosing another model queues its prompt without changing the active reply
    Then browser chat switches queued models automatically and preserves request order
  Scenario: Closing a conversation discards its queued model work
    Then closing a waiting browser conversation cancels its prompts and model load
  Scenario: Browser tabs hand the runtime over after their current reply finishes
    Then browser runtime ownership waits for active replies and releases idle models across tabs
  Scenario: A replaced runtime module hands its model to the current module in the same tab
    Then browser runtime modules in one tab release their models before switching
