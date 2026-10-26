# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@repository-menu
Feature: Manage browser repositories from the repository menu
  Scenario Outline: Repository dialogs stay centered without shadows at <width> pixels with <motion> motion
    Then repository dialogs are centered and keyboard accessible at <width> pixels with "<motion>" motion
    Examples:
      | width | motion        |
      | 1280  | no-preference |
      | 390   | no-preference |
      | 390   | reduce        |

  Scenario: Repository menu renames preserve the selected files and saved history
    Given a browser repository named "Original repository" with an empty file "notes.txt"
    When I type "Saved before rename" into the code document
    Then the repository menu renames the current repository without changing its saved files or history

  Scenario: Repository menu deletion requires confirmation and preserves another repository
    Given a browser repository named "Keep repository" with an empty file "keep.txt"
    When I type "Keep these saved changes" into the code document
    Given a browser repository named "Delete repository fixture" with an empty file "remove.txt"
    When I type "Remove these saved changes" into the code document
    Then the repository menu confirms permanent deletion and keeps the other repository intact

  Scenario: Repository menu deletion of the final repository returns to an empty workspace
    Given a browser repository named "Last repository" with an empty file "notes.txt"
    Then deleting the final repository leaves the repository creation and import actions available

  @development
  Scenario: Permanent repository cleanup resumes after an interrupted deletion
    Then interrupted repository deletion finishes removing local files and private history after reopening
