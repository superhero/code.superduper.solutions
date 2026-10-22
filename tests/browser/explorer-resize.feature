# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@explorer-resize
Feature: Adjustable repository explorer width
  Background:
    Given a browser repository named "Resizable explorer" with an empty file "main.js"
    When I type "const untouched = true;" into the code document

  Scenario: Dragging the explorer divider persists independently of file history
    Given the current edit and source Git histories are recorded
    Then the explorer divider resizes and persists without changing file history
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Cancelling a drag restores width and keyboard resizing stays bounded
    Then explorer resizing can be cancelled and controlled with the keyboard
