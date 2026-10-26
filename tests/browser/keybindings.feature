# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@keybindings
Feature: Configurable keyboard actions
  Background:
    Given a browser repository named "Keybindings fixture" with an empty file "main.js"

  Scenario: Undo shortcuts change live persist and leave native text fields alone
    Then custom undo shortcuts replace defaults and survive reload

  Scenario: Editor shortcuts conflicts disabling and repository inheritance work together
    Then custom editor shortcuts reject conflicts and inherit repository choices

  Scenario: Application shortcuts operate on the focused split viewport
    Then custom tab and comparison shortcuts target the focused split viewport

  Scenario: Contextual completion shortcuts and Save remapping use their configured actions
    Then completion acceptance can share Tab with indentation and Save can run an editor command

  Scenario: Formatting shortcuts work in split panes as one undoable edit
    Given JavaScript formatting support is installed
    Then the configured formatter shortcut formats the focused split editor

  Scenario: Shortcut controls remain aligned across pane widths and while adding alternatives
    Then shortcut rows keep Add in their headers across Settings widths
