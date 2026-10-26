# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Interface typography is independent of editor typography
  Scenario: Interface fonts apply live persist and support repository overrides and undo
    Given a browser repository named "Interface fonts" with an empty file "notes.txt"
    Then interface font changes preserve the editor font across reload and undo

  Scenario: Interface size presets scale page text independently of the editor
    Given a browser repository named "Interface sizes" with an empty file "notes.js"
    Then interface size presets persist independently of editor text and support undo

  Scenario: File explorer icons can be hidden without changing folder navigation
    Given a browser repository named "Explorer icons" with an empty file "src/notes.js"
    Then file explorer icons can be hidden persistently and restored by repository settings

  Scenario: Middle-click closes tabs by default and can be disabled
    Given a browser repository named "Middle tabs" with an empty file "notes.js"
    Then middle-click tab closing preserves source and a persisted disabled setting

  Scenario: Google editor fonts load on selection and can be installed for offline use
    Given a browser repository named "Google fonts" with an empty file "notes.js"
    Then Google editor fonts load only on selection and installed fonts survive offline reload

  Scenario: Editor font options preview visible typefaces without selecting them
    Given a browser repository named "Font previews" with an empty file "notes.js"
    Then editor font options lazily preview their own typefaces without changing the selection

  Scenario: Default JetBrains Mono is bundled and available offline without installation
    Given a browser repository named "Bundled font" with an empty file "notes.js"
    Then JetBrains Mono starts at thirteen pixels and stays installed on offline reload

  Scenario: Interface Google fonts support search previews installation and independent offline restoration
    Given a browser repository named "Interface Google fonts" with an empty file "notes.js"
    Then interface Google fonts preview install and restore offline independently of the editor
