# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-source
Feature: Pinned installable browser inference with the existing Pi agent
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
    Then concurrent browser turns and unloads are rejected until the current turn finishes
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
