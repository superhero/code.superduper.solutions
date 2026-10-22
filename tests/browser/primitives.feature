# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@development
Feature: Shared interface primitives
  Background:
    Given the shared interface primitives are mounted in an isolated fixture

  Scenario: Buttons support native keyboard activation
    Then the enabled button activates once from the keyboard

  @tooltips
  Scenario: Disabled actions explain their state without activation
    Then the disabled action remains inactive and exposes its explanatory tooltip

  Scenario: Disabled button links cannot navigate
    Then the disabled destination has no navigation target or keyboard tab stop

  @tooltips
  Scenario: Tooltips preserve the visible control name
    Then the described action keeps its name while exposing help on keyboard focus

  @tooltips
  Scenario: Explanatory tooltips do not block controls underneath
    Then a focused tooltip lets clicks reach an overlapping action

  Scenario: Dialog focus stays inside the panel and returns on Escape
    When the fixture panel is opened
    Then keyboard focus wraps within the panel
    And Escape closes the panel and restores its trigger focus

  Scenario: The panel close control has an accessible name
    When the fixture panel is opened
    Then the named close control dismisses the panel and restores trigger focus

  Scenario: Buttons keep their size on hover and focus after resizing
    Then shared buttons keep their size on hover and focus after resizing
    And shared button size stays stable with reduced motion

  Scenario: Portal controls keep their size on hover and focus
    When the fixture panel is opened
    Then panel buttons keep their size on hover and focus after resizing
