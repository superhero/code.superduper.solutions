# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ollama-ui
Feature: Local Ollama conversation pane
  @ai-generation-time
  Scenario: Result tooltips hide timing until hover and retain local user timestamps
    Then AI result icons show status on the left and first response plus total time on the right only on hover or focus
  @ai-stream-stability
  Scenario: Streaming Markdown keeps the height already shown to the reader
    Then completing streamed Markdown links never retracts the expanded reply

  @ai-growth-motion
  Scenario: Generated replies slide open and keep scrolling under reader control
    Then growing replies animate without retracting and honor reduced motion and manual scrolling

  @ai-interruption-ui
  Scenario Outline: A centered Skull explains an AI interruption caused by <cause>
    Then an AI "<cause>" interruption shows a centered Skull with its reason and clears on the next reply

    Examples:
      | cause  |
      | limit  |
      | error  |
      | stop   |

  @ai-generation-layout
  Scenario: Growing replies keep the generation control directly below the last message
    Then long AI replies retain aligned widths and a stop control that follows the last message

  @ai-math-ui
  Scenario: AI messages render LaTeX math with embedded fonts offline
    Then AI messages render inline and display math without external resources

  @ai-input-settings
  Scenario: AI Send visibility and Enter behavior are configurable and persist
    Then AI input settings change the controls and keyboard behavior live and after reload

  Scenario: Local discovery and burst streaming preserve text with bounded rendering
    Then the Ollama pane discovers local models and batches streamed text

  @ai-markdown-ui
  Scenario: Markdown source stays visible and formatted in the message input
    Then the AI composer formats visible Markdown and sends its unchanged source

  @ai-markdown-ui
  Scenario: Streaming Markdown formats replies without replacing completed blocks
    Then AI Markdown replies preserve stable blocks and selections through completion

  Scenario: Cancellation and responsive reopening retain the conversation
    Then stopping and closing Ollama cancel generation and preserve partial replies

  Scenario: Conversation tabs exist offline and keep runtime models drafts and messages separate
    Then Ollama conversations keep independent connection choices drafts and transcripts

  Scenario: Background replies and tab closure remain owned by their conversation
    Then switching Ollama conversations isolates streams and closing a tab cancels only its requests

  Scenario: Offline conversation tabs scroll and support keyboard navigation and closure
    Then Ollama conversation tabs work before connecting with overflow and keyboard controls

  Scenario: Session tabs support inline renaming without changing conversation state
    Then AI session titles can be renamed from their context menus without interrupting replies

  Scenario: Connection settings edit saved names and keep runtime URLs out of chat
    Then AI connection settings prefill existing profiles and persist edits without duplicates

  @ai-mdit-catalog
  Scenario: Extended source formatting and interactive Markdown work for both roles offline
    Then the complete Markdown catalog is usable in the composer and conversation

  @ai-mdit-imports
  Scenario: Markdown imports read repository files without exposing expanded content to inference
    Then AI Markdown resolves repository includes and snippets while sending original directives

  @ai-markdown-presentation
  Scenario: Rendered Markdown has readable document structure across themes and pane sizes
    Then rendered Markdown retains clear hierarchy lists and nested spacing without overflowing the AI pane

  @ai-harness-ui
  Scenario: Settings feed the Pi tool loop and context controls remember each model
    Then AI settings configure the Pi tools instructions and per-model context with visible results

  @ai-skills-ui
  Scenario: Browser skills import persist and load through the Pi harness
    Then AI skills can be imported edited toggled and loaded through Pi

  @ai-git-together
  Scenario: Git and AI stay open independently and restore together
    Then Git and AI panes can remain open together across reload
