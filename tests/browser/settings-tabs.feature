# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@settings-tabs
Feature: Settings sections share scope without a single long page
  Background:
    Given a browser repository named "Settings sections" with an empty file "main.js"

  Scenario: Section titles and their icons use one scale across every Settings tab
    Then Settings section headings share text icon and spacing dimensions across all tabs

  Scenario: Related Settings sections share scope and retain drafts across keyboard navigation
    Then Settings groups related sections and retains scope drafts and keyboard access

  Scenario: Selected Settings tabs and their independent scroll positions survive reopening and reload
    Then Settings remembers its selected tab and each tab scroll position

  Scenario: Mouse wheels scroll overflowing Settings tabs without changing the selected section
    Then Settings tabs support vertical and horizontal wheels and preserve zoom gestures

  Scenario: Editor options and paired sliders adapt to the Settings pane width
    Then Editor option groups and slider tracks stay aligned while resizing Settings

  Scenario: Editor switch descriptions appear on hover and keyboard focus
    Then Editor switches retain title labels and expose descriptions as tooltips

  Scenario: System instructions show editable Markdown and preserve scoped source
    Then System instructions highlight Markdown grow with content and preserve scoped settings

  Scenario: Growing instructions pass wheel scrolling to Settings while chat drafts scroll internally
    Then wheel scrolling over System instructions moves Settings and chat drafts keep their own scrolling

  Scenario: AI connection model and speech setup live in Settings while chat drafts survive
    Then AI setup opens in Settings and preserves connection choices and chat drafts

  Scenario: Connection dialogs create edit and cancel profiles without inline forms
    Then connection actions open accessible dialogs and only Save changes profiles
