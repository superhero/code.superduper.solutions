# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@workspace-panes
Feature: Workspace panes stay beside the editor
  Background:
    Given a browser repository named "Pane layout" with an empty file "main.js"
    And a source commit fixture named "Current source commit" records the current repository

  Scenario: Narrowing a crowded workspace closes older columns and preserves the editor
    Then workspace panes remain columns while older panes close as the viewport narrows

  Scenario Outline: Opening the explorer and AI gives the newly opened pane priority with <motion> motion
    Then the file explorer toggle stays reachable and swaps older panes on a narrow screen with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |

  Scenario: Reload restores the fitted pane layout and keeps closed panes closed
    Then the fitted column layout and file explorer visibility survive reload and expansion

  Scenario: The file explorer shares the editor header rows and can close from its toolbar
    Then the file explorer headers align with the editor and its close control preserves the tree

  Scenario Outline: Vault slides at the far right and fits narrow screens with <motion> motion
    Then Vault slides at the far right and preserves resizing and narrow columns with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |

  Scenario Outline: The file explorer slides without squeezing its contents with <motion> motion
    Then the file explorer content and editor move together on opening and closing with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |

  Scenario Outline: Resources slides to the right of Vault and fits narrow screens with <motion> motion
    Then Resources slides after Vault and preserves resizing sampling and narrow columns with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |

  Scenario Outline: Vault stays aligned between AI and Resources with <motion> motion at <width> pixels
    Then Vault and its neighbours stay aligned on opening closing and reversal with "<motion>" motion at <width> pixels

    Examples:
      | motion        | width |
      | no-preference | 1440  |
      | no-preference | 1920  |
      | reduce        | 1440  |
      | reduce        | 1920  |

  Scenario Outline: Side-pane resize handles recover after interrupted opening and closing with <motion> motion
    Then every side pane remains resizable after interrupted toggles with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |

  @development
  Scenario Outline: History and Git divider hover recovers after shared pane hot updates with <motion> motion
    Then History and Git dividers remain interactive after development hot updates with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |

  @development
  Scenario: Already-stuck History and Git dividers recover when their implementation updates
    Then already-stuck History and Git dividers recover through the actual implementation upgrade

  Scenario Outline: Settings slides independently and remains resizable with <motion> motion
    Then Settings slides after Resources and preserves the editor resize and scroll with "<motion>" motion

    Examples:
      | motion        |
      | no-preference |
      | reduce        |

  Scenario: Settings keyboard history leaves file edits intact while both panes are open
    Then Settings and file keyboard undo redo stay independent in adjacent panes
