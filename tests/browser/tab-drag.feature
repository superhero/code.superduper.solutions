# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@tab-drag
Feature: Moving file tabs within and between editor viewports
  Background:
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open the repository file "src/lib/index.ts"
    And native tab dragging is observed

  Scenario: Reordering an inactive tab shows an insertion line and preserves selection across reload and history
    Given the current edit and source Git histories are recorded
    When I hold tab "file2.txt" in viewport 1 before tab "src/lib/index.ts" in viewport 1
    Then the tab insertion line marks that boundary in the link hover color
    When I release the dragged tab
    Then viewport 1 has tabs "file10.txt,file2.txt,src/lib/index.ts" with "src/lib/index.ts" selected
    And the edit Git history is unchanged
    And the source Git history is unchanged
    When the editor is reloaded after persistence
    Then viewport 1 has tabs "file10.txt,file2.txt,src/lib/index.ts" with "src/lib/index.ts" selected
    And file history Undo and Redo are unavailable

  Scenario: Transferring a tab opens it in the destination and keeps per-file cursor positions
    When I select viewport 1 tab "file10.txt"
    And I place viewport 1 cursor at the end
    And I select viewport 1 tab "src/lib/index.ts"
    And I open tab "file2.txt" in split view
    And I hold tab "file10.txt" in viewport 1 after tab "file2.txt" in viewport 2
    And the held tab drag survives a window blur
    And I release the dragged tab
    Then viewport 1 has tabs "file2.txt,src/lib/index.ts" with "src/lib/index.ts" selected
    And viewport 2 has tabs "file2.txt,file10.txt" with "file10.txt" selected
    And viewport 2 contains "Tenth root file"
    And viewport 2 cursor is at the end
    When I watch tab-drag viewport 2
    And I select viewport 2 tab "file2.txt"
    And I place viewport 2 cursor at the beginning
    Then viewport 2 contains "Second root file"
    When I select viewport 2 tab "file10.txt"
    Then viewport 2 cursor is at the end
    And the watched tab-drag viewport keeps its editor while changing files
    When I select viewport 2 tab "file2.txt"
    Then viewport 2 cursor is at the beginning
    When the editor is reloaded after persistence
    Then viewport 2 has tabs "file2.txt,file10.txt" with "file2.txt" selected
    When I select viewport 2 tab "file10.txt"
    Then viewport 2 contains "Tenth root file"
    And viewport 2 cursor is at the end
    When I close viewport 2 tab "file10.txt"
    Then viewport 2 has tabs "file2.txt" with "file2.txt" selected
    And viewport 2 cursor is at the beginning
    And file history Undo and Redo are unavailable

  Scenario: Tabs move between three viewports without replacing an unrelated editor
    When I open tab "file2.txt" in split view
    And I split editor pane 2 again
    And I watch tab-drag viewport 3
    And I drag tab "file10.txt" in viewport 1 after tab "file2.txt" in viewport 2
    Then the watched tab-drag viewport keeps its editor and minimap
    And viewport 2 has tabs "file2.txt,file10.txt" with "file10.txt" selected
    When I drag tab "file10.txt" in viewport 2 before tab "file2.txt" in viewport 3
    Then viewport 2 has tabs "file2.txt" with "file2.txt" selected
    And viewport 3 has tabs "file10.txt,file2.txt" with "file10.txt" selected
    And viewport 3 contains "Tenth root file"
    When I drag tab "file2.txt" in viewport 2 after tab "file2.txt" in viewport 3
    Then there are 2 tab-drag viewports
    And viewport 2 has tabs "file10.txt,file2.txt" with "file2.txt" selected

  Scenario: Moving the final primary tab promotes a populated split without duplicates or file-history steps
    When I open tab "file2.txt" in split view
    And I drag tab "file10.txt" in viewport 1 after tab "file2.txt" in viewport 2
    And I drag tab "src/lib/index.ts" in viewport 1 after tab "file10.txt" in viewport 2
    And I drag tab "file2.txt" in viewport 1 after tab "src/lib/index.ts" in viewport 2
    Then there are 1 tab-drag viewports
    And viewport 1 has tabs "file10.txt,src/lib/index.ts,file2.txt" with "file2.txt" selected
    And viewport 1 contains "Second root file"
    And file history Undo and Redo are unavailable

  Scenario: Deleting the final primary file preserves the populated split and its selected file
    When I open tab "file2.txt" in split view
    And I drag tab "file10.txt" in viewport 1 after tab "file2.txt" in viewport 2
    And I drag tab "src/lib/index.ts" in viewport 1 after tab "file10.txt" in viewport 2
    And I right-click the tree filename "file2.txt"
    And I choose Delete file for "file2.txt"
    And I confirm the filename deletion
    Then there are 1 tab-drag viewports
    And viewport 1 has tabs "file10.txt,src/lib/index.ts" with "src/lib/index.ts" selected
    And viewport 1 contains "Nested source file"

  Scenario: Cancelling a native tab drag and dropping external text leave the workspace unchanged
    Given the current edit and source Git histories are recorded
    When I hold tab "file10.txt" in viewport 1 before tab "file2.txt" in viewport 1
    Then the tab insertion line marks that boundary in the link hover color
    When I cancel the held tab drag
    Then viewport 1 has tabs "file2.txt,file10.txt,src/lib/index.ts" with "src/lib/index.ts" selected
    When I drop external text on viewport 1 tabs
    Then viewport 1 has tabs "file2.txt,file10.txt,src/lib/index.ts" with "src/lib/index.ts" selected
    And no tab insertion line remains
    And the edit Git history is unchanged
    And the source Git history is unchanged
