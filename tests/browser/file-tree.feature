# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Repository directory tree
  Background:
    When I import a directory with a nested file tree

  Scenario: Directories expand and collapse in folders-first natural order without opening files
    Given interface motion is enabled
    Then no repository file is open
    And the visible repository tree paths are
      | path       |
      | dir2       |
      | dir10      |
      | src        |
      | file2.txt  |
      | file10.txt |
    And the repository directory "src" is collapsed
    When I toggle the repository directory "src"
    Then the repository directory "src" is expanded
    And the repository tree item "src/lib" displays the name "lib"
    When I toggle the repository directory "src/lib"
    Then the visible repository tree paths are
      | path             |
      | dir2             |
      | dir10            |
      | src              |
      | src/lib          |
      | src/lib/index.ts |
      | file2.txt        |
      | file10.txt       |
    And the repository tree item "src/lib/index.ts" displays the name "index.ts"
    And no repository file is open
    When I toggle the repository directory "src"
    Then the repository directory "src" is collapsed
    And the visible repository tree paths are
      | path       |
      | dir2       |
      | dir10      |
      | src        |
      | file2.txt  |
      | file10.txt |
    And no repository file is open

  Scenario: Matching file names in separate directories open their own contents
    When I toggle the repository directory "dir2"
    And I toggle the repository directory "dir10"
    Then the repository tree item "dir2/index.ts" displays the name "index.ts"
    And the repository tree item "dir10/index.ts" displays the name "index.ts"
    And no repository file is open
    When I open the repository file "dir2/index.ts"
    Then the code document contains "First directory\n" after persistence
    And the repository tree file "dir2/index.ts" is selected
    When I open the repository file "dir10/index.ts"
    Then the code document contains "Second directory\n" after persistence
    And the repository tree file "dir10/index.ts" is selected
    When I toggle the repository directory "src"
    And I toggle the repository directory "src/lib"
    Then the code document contains "Second directory\n" after persistence
    And the repository tree file "dir10/index.ts" is selected
    And the expanded repository tree is captured

  Scenario: Collapsing the active file's ancestor keeps its document open
    When I open the repository file "src/lib/index.ts"
    Then the repository tree file "src/lib/index.ts" is selected
    When I toggle the repository directory "src"
    Then the repository directory "src" is collapsed
    And the code document contains "Nested source file\n" after persistence
    When I type "x" into the code document
    Then the code document contains "Nested source file\nx" after persistence
    And the repository directory "src" is collapsed
    When I toggle the repository directory "src"
    Then the repository tree file "src/lib/index.ts" is selected

  Scenario Outline: Tree keyboard navigation waits for explicit file activation
    When I focus the repository tree item "dir2"
    And I press "ArrowRight" in the repository tree
    Then the repository directory "dir2" is expanded
    And the repository tree item "dir2" has focus
    When I press "ArrowRight" in the repository tree
    Then the repository tree item "dir2/index.ts" has focus
    When I press "ArrowDown" in the repository tree
    Then the repository tree item "dir10" has focus
    When I press "ArrowUp" in the repository tree
    Then the repository tree item "dir2/index.ts" has focus
    When I press "ArrowLeft" in the repository tree
    Then the repository tree item "dir2" has focus
    When I press "ArrowLeft" in the repository tree
    Then the repository directory "dir2" is collapsed
    When I press "End" in the repository tree
    Then the repository tree item "file10.txt" has focus
    When I press "Home" in the repository tree
    Then the repository tree item "dir2" has focus
    When I press "s" in the repository tree
    Then the repository tree item "src" has focus
    When I press "ArrowRight" in the repository tree
    And I press "ArrowRight" in the repository tree
    Then the repository tree item "src/lib" has focus
    When I press "ArrowRight" in the repository tree
    And I press "ArrowRight" in the repository tree
    Then the repository tree item "src/lib/index.ts" has focus
    And no repository file is open
    When I press "<activation>" in the repository tree
    Then the code document contains "Nested source file\n" after persistence
    And the repository tree file "src/lib/index.ts" is selected
    Examples:
      | activation |
      | Enter      |
      | Space      |

  Scenario: Explorer rows match the branch selector height with consistent gaps
    When I toggle the repository directory "src"
    Then file and directory rows match the branch selector height
