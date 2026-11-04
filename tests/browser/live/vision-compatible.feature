# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-live @browser-vision-compatible-live
Feature: Compatible image interpretation in the real editor
  Scenario: Compatible vision installs and interprets pixels on a device without shader-f16
    Then the compatible image model reads colored shapes and visible text with drained GPU work
  Scenario: A real image tool round trip preserves text skills and repository tools
    Then a strict text agent inspects the image and retains its progressive skill and file results
  Scenario: Insufficient storage-buffer capability preserves the current text model
    Then the editor refuses eight-buffer image execution before suspending strict text
  Scenario: Cancellation fences image callbacks and cached models reload without downloads
    Then cancelling an active image request releases it and cached vision reloads offline
