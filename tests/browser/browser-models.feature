# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-ui
Feature: Explicit browser model installation and local inference controls
  Scenario: Six models expose their own engine settings evidence and compatibility without downloads
    Then browser model controls expose six pinned profiles and retain generation settings without downloading weights
  Scenario: Cancellation discards partial model installation without affecting repositories
    Then cancelling a browser model installation removes its unfinished byte ranges
  Scenario: Verified chunked model files load from browser storage with no network fallback
    Then the browser model store verifies bounded ranges and serves local cross-chunk reads offline
  Scenario: Native tensor slices can span more than 128 MiB without becoming whole-model downloads
    Then browser model storage serves a large native tensor slice from bounded local blocks
  Scenario: Invalid and truncated model downloads never become installed artifacts
    Then browser model storage rejects corrupt oversized and incomplete ranges
  Scenario: Shared runtime removal preserves other installed models and respects active readers
    Then browser model removal retains shared files and refuses an active model lease
  Scenario: Images reach both native adapters through the existing Pi conversation loop
    Then browser images are bounded resized and replayed through both native Pi adapters
  Scenario: The Browser models connection discovers installed profiles and owns its image draft
    Then browser conversations discover installed models and retain image attachments only in their own draft
  Scenario: The missing browser model notice stays at the bottom until an installation exists
    Then browser conversations keep the missing model notice visible and follow installation changes across tabs
