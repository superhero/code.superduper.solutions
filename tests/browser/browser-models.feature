# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-ui
Feature: Explicit browser model installation and local inference controls
  Scenario: Browser chat opens directly with all catalog models
    Then browser model menus expose the full catalog before any model is installed
  Scenario: New browser chats skip connection setup while remote sessions keep their choices
    Then new AI sessions default to the browser composer and retain explicit session choices
  Scenario: Previously saved Ollama profiles stay editable and can be removed
    Then an existing local Ollama profile is preserved without becoming a protected default
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
  Scenario: The WebML connection discovers installed profiles and owns its image draft
    Then browser conversations discover installed models and retain image attachments only in their own draft
  Scenario: Model availability updates without hiding the browser composer
    Then browser model availability follows installation changes without hiding the composer

  Scenario: Explicit model selection prepares it and supports cancellation
    Then selecting a browser model starts its preparation and can be cancelled without losing the draft

  Scenario: Expanded AI settings separate language vision and decision models without downloading weights
    Then AI settings offer Gemma MiniCPM LFM vision and the nine decision profiles separately
  Scenario: Split optional SDK downloads retain complete verified bytes across block boundaries
    Then split browser runtime assets verify and stream from installed blocks offline
  Scenario: The pinned Gemma SDK initializes its native Wasm in a classic Blob worker offline
    Then the installed LiteRT loader initializes native Wasm using only verified Blob URLs

  Scenario: Gemma image attachments use the separate vision path even before model preparation succeeds
    Then a Gemma conversation accepts a local image without requiring native multimodal settings

  Scenario: Interrupted range downloads retry without double-counting bytes in the checksum
    Then browser model downloads recover from a broken stream and transient server error
  Scenario: Repeated network failures and cancelled retries leave no partial installation
    Then browser model retries are bounded and cancellation interrupts their backoff
