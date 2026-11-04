# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Official compatible image inference without shader-f16
  Scenario: The compatible profile preserves official pins and the earlier image choices
    Then compatible vision installs the five original Q4 and FP32 model files
  Scenario: Unsupported storage-buffer limits fail before text suspension
    Then compatible image preflight requires nine storage buffers without shader-f16
  Scenario: Each ONNX session binds the owned GPU device and correct external data
    Then compatible vision sessions share an explicit device and embedded token weights
  Scenario: GPU execution receipts distinguish submitted work from completed work
    Then compatible vision requires positive drained GPU dispatches and serializable metadata
  Scenario: Vision teardown destroys the device after session release even on failure
    Then compatible vision teardown releases sessions before draining and destroying its device
