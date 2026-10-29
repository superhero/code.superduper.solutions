# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@browser-models-live
Feature: Real browser-local inference in the editor
  Scenario: The live browser has the qualified GPU and native loader capabilities
    Then the live editor browser passes real GPU and WebAssembly checks
  Scenario Outline: Language models answer through the composer and execute a real Pi tool
    Then the live editor prepares "<model>" and completes a text and native tool exchange
    Examples:
      | model |
      | kg-browser-assistant-gemma4-e2b |
      | kh-browser-assistant-minicpm5-2b |
      | gw-browser-pi-bonsai2-2b |

  Scenario Outline: A separate LFM image tool restores the selected language model
    Then the live "<model>" reads a fresh image code and continues after vision cleanup
    Examples:
      | model |
      | kg-browser-assistant-gemma4-e2b |
      | kh-browser-assistant-minicpm5-2b |
  Scenario Outline: Decision model <model> returns complete native probabilities
    Then the live decision profile "<model>" scores a known routing question
    Examples:
      | model |
      | kt-browser-decision-d3-lite-gguf-bf16 |
      | kz-browser-decision-d3-nano-q8 |
      | la-browser-decision-d3-mini-q8 |
      | lb-browser-decision-d3-flash-q8 |
      | kx-browser-decision-strands-portable-matmul |
      | ks-browser-decision-strands-current-int4-cpu |
      | kv-browser-decision-knowline-gen55-top64 |
      | kw-browser-decision-elephant1-q4 |
      | ky-browser-decision-pplx-flash-v3 |
  Scenario Outline: Auxiliary model <model> leaves the chat language selector unchosen
    Then loading the live auxiliary profile "<model>" leaves a fresh chat without an LLM
    Examples:
      | model |
      | ks-browser-decision-strands-current-int4-cpu |
      | jo-browser-mobile-lfm25-vl16b-letterbox |
  @browser-speech-live
  Scenario Outline: Speech model <mode> recognizes a real microphone fixture through the composer
    Then the live speech profile "<mode>" dictates a known recording into the composer
    Examples:
      | mode |
      | cpu |
      | gpu-fp16 |
      | gpu-fp32 |

  Scenario: LFM3 text completes a real Pi tool exchange
    Then the live editor prepares "le-browser-lfm3-text" and completes a text and native tool exchange

  Scenario Outline: LFM3 image profile <model> understands real image pixels
    Then the live LFM3 image profile "<model>" describes a colored shape
    Examples:
      | model |
      | lg-browser-lfm3-vl |
      | li-browser-lfm3-omni |

  Scenario: d1-Omni preserves its six native classification checks
    Then the live d1-Omni profile passes the six reference classification checks

  @browser-speech-live
  Scenario Outline: Batch speech model <mode> recognizes the microphone fixture
    Then the live speech profile "<mode>" dictates a known recording into the composer
    Examples:
      | mode |
      | lfm3-audio |
      | lfm3-omni |
      | phonon |
