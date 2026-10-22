# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@navigation
Feature: Stable controls while navigating the repository
  Background:
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open the repository file "file2.txt"

  Scenario: Page dropdown navigation does not temporarily disable unrelated controls
    Given the current edit and source Git histories are recorded
    And repository control availability is being observed
    When I switch repository views in this order:
      | view     |
      | History  |
      | Settings |
      | Editor   |
      | Editor   |
    Then repository controls stayed available during navigation
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: File tabs preserve control availability and display the selected file
    Given repository control availability is being observed
    When I choose the open file tab "file10.txt"
    Then the code document contains "Tenth root file\n" after persistence
    When I choose the open file tab "file2.txt"
    Then the code document contains "Second root file\n" after persistence
    And repository controls stayed available during navigation

  Scenario: The whole file tab highlights and selects its file while close stays independent
    When I click the "left" padding of open file tab "file10.txt"
    Then the open file tab "file10.txt" is selected
    And the code document contains "Tenth root file\n" after persistence
    When I click the "right" padding of open file tab "file2.txt"
    Then the open file tab "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    When I click the "top-left" padding of open file tab "file10.txt"
    Then the open file tab "file10.txt" is selected
    And the code document contains "Tenth root file\n" after persistence
    When I click the "top-right" padding of open file tab "file2.txt"
    Then the open file tab "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    When I click the "bottom-left" padding of open file tab "file10.txt"
    Then the open file tab "file10.txt" is selected
    And the code document contains "Tenth root file\n" after persistence
    When I click the "bottom-right" padding of open file tab "file2.txt"
    Then the open file tab "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence
    And the open file tab "file2.txt" keeps its selection background at rest and on hover
    And the open file tab "file10.txt" keeps its selection background at rest and on hover
    When I close the file tab "file10.txt"
    Then the open file tab "file2.txt" is selected
    And the code document contains "Second root file\n" after persistence

  Scenario: Rapid file navigation retains every accepted edit and the last selection
    Given the current edit and source Git histories are recorded
    When I rapidly type "abcdefghijklmnopqrstuvwxyz0123456789ABCD" and immediately choose these file tabs:
      | path       |
      | file10.txt |
      | file2.txt  |
    Then the open file tab "file2.txt" is selected
    And the code document contains "Second root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    When I choose the open file tab "file10.txt"
    Then the code document contains "Tenth root file\n" after persistence
    When I choose the open file tab "file2.txt"
    Then the code document contains "Second root file\nabcdefghijklmnopqrstuvwxyz0123456789ABCD" after persistence
    And exactly 1 distinct Git edit commits precede the recorded history
    And the source Git history is unchanged
