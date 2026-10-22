# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@local-git-ui
Feature: Review and perform local Git operations
  Background:
    Given a browser repository named "Local Git fixture" with an empty file "main.js"

  @git-staging-ui
  Scenario: Editor commit review stages hunks and preserves unstaged edits
    When I type "const first = 1;\n\nconst second = 2;\n" into the code document
    Then editor commit review opens staged comparisons without including unstaged edits

  @git-staging-ui
  Scenario: Staged deletions open in an editor comparison without a working file
    When I type "const removed = true;" into the code document
    Given a source commit fixture named "Before staged deletion" records the current repository
    When I delete the selected file
    Then a staged deletion opens read only in the editor and survives reload

  @git-staging-ui
  Scenario: Commit reviews stage changed files by default and preserve explicit exclusions
    Then new commit reviews stage all files and retain manual exclusions across reopening and reload

  @git-hover-ui
  Scenario: Git actions preserve their backgrounds on hover
    When I type "const value = 1;" into the code document
    Given a source commit fixture named "Hover baseline" records the current repository
    Then Git action buttons and commit rows change only their foreground on hover

  Scenario: Both History views open the shared local Git workflow
    Then both history views expose Git operations and commit inspection does not check out

  @commit-diff-ui
  Scenario: Historical file comparisons open in independent read-only editor tabs
    When I type "const version = 1;" into the code document
    Given a source commit fixture named "Original version" records the current repository
    When I replace the code document with:
      """
      const version = 2;
      """
    Given a source commit fixture named "Changed version" records the current repository
    When I delete the selected file
    Then commit comparisons retain both immutable versions in editor tabs across reload

  Scenario: Git action defaults preserve choices across operations and reopening
    Then Git targets and merge methods start selected and preserve explicit choices

  @git-targets-ui
  Scenario: Git operations offer only applicable branches tags or commits
    Given a source commit fixture named "Target baseline" records the current repository
    Then Git targets match their operation and exclude the current branch where required

  @git-recovery-ui
  Scenario: Recovery uses the shared operation and target dropdowns
    When I type "const retained = true;" into the code document
    Given a source commit fixture named "Before amendment" records the current repository
    Then Recovery uses the operation dropdown and checkpoint targets with explicit confirmation

  @development
  Scenario: Local Git merge conflicts can be resolved through the shared panel
    Then the Git panel resolves a conflicting merge and survives reload

  Scenario: Git pane docks beside the editor and covers the workspace on small screens
    Then Git pane motion, layout and focus adapt without losing the commit draft

  Scenario Outline: <entry> toggles its pane in Editor and History
    Given the current edit and source Git histories are recorded
    Then the "<entry>" button toggles the Git pane without losing drafts
    And the edit Git history is unchanged
    And the source Git history is unchanged

    Examples:
      | entry          |
      | Git operations |
      | Commit changes |

  Scenario: Git pane divider resizes and persists without changing file history
    Given the current edit and source Git histories are recorded
    Then Git pane resizing supports dragging cancellation keyboard and responsive restoration
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Dock motion keeps the main view alongside the Git pane
    Then the main view follows Git pane opening and closing across views

  Scenario: Git dock motion can reverse without jumping
    Then toggling the Git pane during its slide reverses smoothly

  Scenario: Git pane header rows align with the main view at every interface size
    Then Git header toolbar and tab edges share the main view pixel coordinates

  Scenario Outline: Overflowing Git tabs remain reachable at <width> pixels
    Given the current edit and source Git histories are recorded
    Then overflowing Git tabs support mouse wheel trackpad and keyboard navigation at <width> pixels
    And the edit Git history is unchanged
    And the source Git history is unchanged

    Examples:
      | width |
      | 1440  |
      | 320   |

  Scenario Outline: Git tabs keep their first card visible with <motion> motion at <width> pixels
    Then Git tab changes keep their first card visible with "<motion>" motion at <width> pixels

    Examples:
      | motion        | width |
      | no-preference | 1440  |
      | no-preference | 390   |
      | reduce        | 1440  |

  Scenario Outline: Git dropdown labels keep hover active across their spacing at <width> pixels
    Given a source commit fixture named "Dropdown hover baseline" records the current repository
    When I request a new branch named "feature/hover"
    Then the active branch is "feature/hover"
    And Git dropdown labels and controls share a continuous hover area at <width> pixels

    Examples:
      | width |
      | 1440  |
      | 390   |
