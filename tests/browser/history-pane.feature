# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@history-pane
Feature: History shares the independent right dock
  Scenario: History preserves the editor and restores alongside Git and AI
    Given a browser repository named "History dock" with an empty file "notes.txt"
    When I type "history fixture" into the code document
    Then History slides beside the editor with independent resizing and restoration
