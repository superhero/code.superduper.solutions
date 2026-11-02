# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-live @browser-gpu-resume-live
Feature: Verified GPU upgrades in the editor
  Scenario Outline: Strict chat <model> preserves real tools skills and GPU placement
    Then strict editor chat "<model>" completes genuine repository and progressive skill exchanges
    Examples:
      | model |
      | ix-browser-shared-wllama-ornith-q4 |
      | iy-browser-shared-wllama-ornith-q8 |
      | kh-browser-assistant-minicpm5-2b |
      | le-browser-lfm3-text |
  @browser-speech-live
  Scenario: Continuous GPU dictation preserves long audio drafts and offline recovery
    Then the editor continuously dictates 75 seconds and drains a 600 second durable backlog
  @browser-speech-live
  Scenario Outline: GPU detector <vad> preserves integrated dictation
    Then continuous editor dictation with "<vad>" uses GPU detection and finalizes the fixture
    Examples:
      | vad |
      | firered |
      | fsmn |
      | marblenet |
