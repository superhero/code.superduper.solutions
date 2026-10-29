# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-source
Feature: Pinned installable browser inference with the existing Pi agent
  Scenario: Native loading reports streamed bytes and uploaded tensors accurately
    Then native model progress maps loaded counts and keeps their measurement units
  Scenario: Loading stages without counters never invent a percentage
    Then model loading progress without valid counts remains indeterminate
  Scenario Outline: Choosing a browser model installs only missing files and loads it
    Then choosing a browser model that is "<availability>" prepares it for inference
    Examples:
      | availability |
      | installed    |
      | missing      |
  Scenario: Cancelling a model choice prevents loading unfinished downloads
    Then cancelling model installation stops selected-model loading
  Scenario: Six profiles preserve official model files runtime pins and scoped image evidence
    Then the browser model catalog retains all six handoff pins and their image limitations
  Scenario: Engine routing controls sampling and device requirements across model families
    Then native browser settings follow the explicit engine and preserve weight revisions
  Scenario: Context sampler and deadline errors are rejected before loading
    Then browser model settings reject invalid or unknown controls
  Scenario: WebML needs GPU compute and Wllama needs its streaming Wasm prerequisites
    Then browser compatibility separates actual GPU capabilities from unknown memory and driver facts
  Scenario: Large Ornith weights cannot silently fall back to the four GiB CPU heap
    Then browser execution plans preserve the CPU heap limit and partial offload choices
  Scenario: Allocation errors permit fallback while network errors remain visible
    Then browser engine fallback disposes failed instances and retries allocation errors only
  Scenario: Cancellation terminates unresponsive native generation
    Then aborting a blocked browser generator unloads it without waiting
  Scenario: Native tool identities arguments parser errors and results survive Pi translation
    Then browser tool translation preserves native arguments identities and result replay
  Scenario Outline: Both browser engines use actual Pi tools and skill loading
    Then the editor Pi harness runs a fresh skill and repository tool exchange through "<engine>"
    Examples:
      | engine |
      | webml  |
      | wllama |
  Scenario: Browser profile validation never creates a remote or credentialed connection
    Then browser connections and context preferences remain local and credential free
  Scenario: A whole Pi turn retains exclusive browser runtime ownership through tool work
    Then browser turns and unloads wait in order until the current tool work finishes
  Scenario: Cancelling queued browser work never interrupts its active owner
    Then cancelled browser jobs are skipped and failures do not block later jobs
  Scenario: Runtime distribution retains the reviewed source build and complete MIT notice
    Then the optional browser runtime matches its reviewed build receipt
  Scenario Outline: Each profile passes its pinned files and controls to the selected native loader
    Then the "<profile>" browser profile loads and streams through its native API contract
    Examples:
      | profile |
      | gw-browser-pi-bonsai2-2b |
      | he-browser-pi-bonsai2-4b |
      | gx-browser-pi-bonsai2-9b |
      | gy-browser-pi-bonsai2-27b |
      | ix-browser-shared-wllama-ornith-q4 |
      | iy-browser-shared-wllama-ornith-q8 |

  Scenario: Verified language vision and native decision profiles remain separate and fully pinned
    Then the expanded catalog exposes nine LLMs three vision profiles and ten native decision profiles
  Scenario: New language engines preserve their qualified settings and text-only loading
    Then Gemma rejects unsupported controls and MiniCPM loads without a vision projector
  Scenario: Offline vision tokenizers probe the installed model commit
    Then the real Transformers tokenizer loads only from the pinned vision revision
  Scenario: The separate image tool releases vision before restoring text and preserves Pi tool history
    Then LFM image inspection uses local image identifiers and restores text after its actual Pi tool call
  Scenario: Cancelling image inspection settles cleanup before any text restoration
    Then cancelled LFM image inspection releases its worker before returning
  Scenario: Native decisions preflight exact input bounds and reject incomplete score distributions
    Then D3 native preflight prevents oversized forwards and decision answers require complete probabilities

  Scenario: Native worker scoring uses its decision deadline and terminates a stalled call
    Then a blocked decision worker stops at its configured scoring deadline
  Scenario: Failed native loads preserve their diagnostic and release the worker
    Then native decision load failures report the allocation error after cleanup
  Scenario: A stalled native decision respects its configured scoring deadline
    Then a blocked native decision stops at its scoring deadline and releases its worker
  Scenario: GPU memory failures explain recovery and preserve their native cause
    Then native GPU exhaustion suggests freeing memory without hiding its allocator diagnostic

  Scenario: LFM3 preserves its isolated native runtime and separates trained reasoning
    Then LFM3 retains its accepted pins and keeps reasoning out of visible answers

  Scenario: The image tool accepts only qualified pinned LFM3 image profiles
    Then the image tool accepts both LFM3 image pins and rejects an altered revision
