# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Automatic languages from configurable filename suffixes
  Scenario: Suffix mappings apply live persist and support undoable repository overrides
    Given a repository with a custom suffix file is imported
    When I map its suffix to JavaScript in personal settings
    Then its syntax updates without changing source files
    When I reload the application with its filename mapping
    Then its personal suffix mapping remains selected
    When I override the suffix as plain text for this repository
    Then its syntax clears and undo restores the inherited mapping

  Scenario: A custom TypeScript suffix works with the installed local language engine
    Given a repository with a custom suffix file is imported
    When I map its suffix to TypeScript and activate the local engine
    Then the mapped file receives TypeScript diagnostics without changing its contents

  Scenario: Remapping an existing JavaScript suffix changes its analysis script kind
    Given a repository with a custom suffix file is imported
    When I remap a JavaScript suffix to TypeScript and activate the local engine
    Then the mapped file receives TypeScript diagnostics without changing its contents
