# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@workspace
Feature: Remember the browser workspace separately from repository history
  Scenario: The selected page persists before any repository is imported
    When I choose the workspace page "Settings"
    And I reload the saved workspace
    Then the workspace page is "Settings"

  Scenario: Each repository restores its ordered tabs and active file after switching and reload
    Given I import a workspace fixture named "Workspace first"
    Then no repository file is open
    When I open the repository file "alpha.txt"
    And I open the repository file "beta.txt"
    And I choose the open file tab "alpha.txt"
    Given I import a workspace fixture named "Workspace second"
    Then no repository file is open
    When I open the repository file "beta.txt"
    And I open the repository file "src/nested/gamma.txt"
    And I choose the open file tab "beta.txt"
    And I select the repository "Workspace first"
    Then the workspace tabs are "alpha.txt, beta.txt" with "alpha.txt" active
    When I reload the saved workspace
    Then the workspace repository is "Workspace first"
    And the workspace tabs are "alpha.txt, beta.txt" with "alpha.txt" active
    When I select the repository "Workspace second"
    Then the workspace tabs are "beta.txt, src/nested/gamma.txt" with "beta.txt" active

  Scenario: Selection and both editor scroll axes survive tab changes and reload without Git revisions
    Given I import a workspace fixture named "Workspace position"
    And the editor footer is enabled
    And the current edit and source Git histories are recorded
    When I open the repository file "alpha.txt"
    And I select and scroll a long workspace document
    And I open the repository file "beta.txt"
    And I choose the open file tab "alpha.txt"
    Then the workspace document selection and scroll position are restored
    When I focus the workspace document without moving its selection
    And I reload the saved workspace
    Then the workspace tabs are "alpha.txt, beta.txt" with "alpha.txt" active
    And the workspace document has keyboard focus
    And the workspace document selection and scroll position are restored
    And the edit Git history is unchanged
    And the source Git history is unchanged

  Scenario: Pages and their scroll positions restore alongside expanded sidebar folders
    Given I import a workspace fixture with a long sidebar
    When I toggle the repository directory "src"
    And I toggle the repository directory "src/nested"
    And I scroll the workspace sidebar
    And I choose and scroll the workspace Settings page
    And I reload the saved workspace
    Then the workspace page is "Settings"
    And the workspace Settings scroll position is restored
    And the repository directory "src" is expanded
    And the repository directory "src/nested" is expanded
    And the workspace sidebar scroll position is restored
    When I choose the workspace page "History"
    And I reload the saved workspace
    Then the workspace page is "History"

  Scenario: Closing every tab preserves the deliberately empty editor on reload
    Given I import a workspace fixture named "Workspace empty"
    When I open the repository file "alpha.txt"
    And I open the repository file "beta.txt"
    And I close the file tab "alpha.txt"
    And I close the file tab "beta.txt"
    And I focus the repository tree item "beta.txt"
    And I reload the saved workspace
    Then the workspace repository is "Workspace empty"
    And no repository file is open
    And the repository tree item "beta.txt" has focus

  Scenario: Malformed workspace metadata does not prevent opening stored repositories
    Given I import a workspace fixture named "Workspace recovery"
    When I open the repository file "beta.txt"
    And the saved workspace metadata is malformed
    And I reload the saved workspace
    Then the workspace repository is "Workspace recovery"
    And the workspace tabs are "beta.txt" with "beta.txt" active
    When I open the repository file "beta.txt"
    Then the code document contains "A short second file.\n" after persistence
