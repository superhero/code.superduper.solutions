# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: GPU-only Brave decision backends
  Scenario: Every offered decision model requires GPU execution
    Then decision choices contain no CPU profiles and fail without usable WebGPU
  Scenario: FP32 and original FP16 Strands retain distinct GPU prerequisites
    Then Strands compatibility requires FP16 only for the original GPU graph
  Scenario: GPU requests cannot silently use CPU model buffers or partial offload
    Then native decision placement rejects CPU fallback and incomplete offload
  Scenario: Forward evidence must match the packed model's native GPU pipeline
    Then native placement accepts case-insensitive Q4_K pipelines and rejects the wrong kernel
  Scenario: Native initialization rejects CPU mode before creating a model
    Then native decision loading refuses CPU execution even when capabilities are available
  Scenario: Shared GPU runtime preserves the exact paired binaries and source recipes
    Then decision GPU artifacts and recipes match their reference receipts
