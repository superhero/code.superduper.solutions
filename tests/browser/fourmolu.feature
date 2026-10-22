# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@fourmolu
Feature: Optional browser-local Haskell formatting
  Scenario Outline: Fourmolu formats source safely with local configuration
    Given a Fourmolu repository with a "<path>" document is imported
    When I explicitly install Fourmolu
    And I format the current document
    Then Fourmolu preserves plain source and creates one undoable edit
    And installed Fourmolu formats again offline after reload
    Examples:
      | path         |
      | Main.hs      |
      | Example.hsig |
  Scenario: Invalid Haskell cannot replace a document or create a formatting revision
    Given a Fourmolu repository with a "Main.hs" document is imported
    When I explicitly install Fourmolu
    Then invalid Haskell reports an error without a formatting edit
