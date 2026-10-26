# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@control-hover
Feature: Standard controls change only their foreground on hover
  Background:
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    Given a source commit fixture named "Hover baseline" records the current repository
    When I type "hover" into the code document

  Scenario: Standard buttons and selectors preserve their backgrounds across panes and dialogs
    Then standard controls preserve their backgrounds on hover and retain keyboard focus feedback

  Scenario: Disabled controls and special hover surfaces retain their treatments
    Then disabled controls stay unchanged while toolbars trees and history retain hover fills
