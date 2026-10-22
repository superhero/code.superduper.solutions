# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Editable split views from file tabs
  Scenario: Tab menus open a second file with durable editing and navigation independent of undo
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    Then the split shows "Second root file" beside "Tenth root file"
    And the split tab is "file2.txt" beside the primary tabs
    When I replace the split document with "Updated second file"
    Then the split shows "Updated second file" beside "Tenth root file"
    When I invoke application "Undo"
    Then the split shows "Second root file" beside "Tenth root file"
    When I invoke application "Redo"
    Then the split shows "Updated second file" beside "Tenth root file"
    When the editor is reloaded after persistence
    Then the split shows "Updated second file" beside "Tenth root file"
    Then the split tab is "file2.txt" beside the primary tabs
    When I close the split using tab "file2.txt"
    Then only the primary editor remains
    When I invoke application "Undo"
    Then only the primary editor remains

  Scenario: Two views of the same file share edits without duplicate Git transactions
    Given a browser repository named "Shared split" with an empty file "main.js"
    When I type "const value = 1;" into the code document
    And I open tab "main.js" in split view
    And I replace the split document with "const value = 2;"
    Then the split shows "const value = 2;" beside "const value = 2;"
    And a split edit adds exactly one change revision
    When I insert a declaration into the primary split document
    Then both split views contain the additional declaration
    When I invoke application "Undo"
    Then the split shows "const value = 2;" beside "const value = 2;"


  Scenario: The split tab focuses its own editor and closes its pane
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    Then the split tab is "file2.txt" beside the primary tabs
    When I activate the split tab "file2.txt"
    Then the split document has keyboard focus
    When I close the split tab "file2.txt"
    Then only the primary editor remains
    And file history Undo and Redo are unavailable
  Scenario: The current editor and new split slide together without resizing live editor frames
    When I request animated split motion
    And I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I fill the primary pane with long split-test source
    And I pause split transitions for frame inspection
    And I open tab "file2.txt" in split view
    Then all editor panes and tabs move together during the split
    When I close the split tab "file2.txt"
    And I request reduced split motion
    And I open tab "file2.txt" in split view
    Then the split pane and tab appear without motion

  Scenario: Adding a third pane moves both existing editors with the incoming split
    When I request animated split motion
    And I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I fill the primary pane with long split-test source
    And I open tab "file2.txt" in split view
    And I pause split transitions for frame inspection
    And I split editor pane 2 again
    Then all editor panes and tabs move together during the split
    And the editor panes show files "file10.txt,file2.txt,file2.txt"

  Scenario: Any pane can split again and multiple panes survive editing reload and undo
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    And I split editor pane 2 again
    And I open tab "file10.txt" in split view
    Then the editor panes show files "file10.txt,file10.txt,file2.txt,file2.txt"
    When I replace editor pane 3 with "Shared multi-pane text"
    Then editor panes 3 and 4 contain "Shared multi-pane text"
    And a split edit adds exactly one change revision
    When I give editor panes 3 and 4 different cursor positions
    And the editor is reloaded after persistence
    Then the editor panes show files "file10.txt,file10.txt,file2.txt,file2.txt"
    And editor panes 3 and 4 retain different cursor positions
    When I close editor pane 3
    Then the editor panes show files "file10.txt,file10.txt,file2.txt"
    When I invoke application "Undo"
    Then the editor panes show files "file10.txt,file10.txt,file2.txt"

  Scenario: Closing the final primary tab preserves the remaining split panes
    Given a browser repository named "Pane promotion" with an empty file "main.js"
    When I type "const value = 1;" into the code document
    And I open tab "main.js" in split view
    And I split editor pane 2 again
    And I close the primary tab in the multiple-pane editor
    Then the editor panes show files "main.js,main.js"
    When I invoke application "Undo"
    Then the editor panes show files "main.js,main.js"

  Scenario: Switching primary tabs leaves other pane rendering intact
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    And I watch the existing split renderer
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    Then the other split keeps its existing editor and minimap

  Scenario: Long split editors retain bounded minimaps and scroll after tab changes
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "src/lib/index.ts"
    And I fill the primary pane with long split-test source
    And I request animated split motion
    And I open tab "src/lib/index.ts" in split view
    And I open the repository file "file2.txt"
    And I open the repository file "src/lib/index.ts"
    Then the right split scrolls and keeps its minimap bounded

  Scenario: Navigation locks reject split edits without changing the pane rendering
    When I import a directory with a nested file tree
    And I open the repository file "file2.txt"
    And I open the repository file "file10.txt"
    And I open tab "file2.txt" in split view
    And I hold the next read of file "file2.txt"
    And I select primary tab "file2.txt" while its read is held
    Then the split rejects edits until navigation finishes

  Scenario: A separately loaded split keeps its minimap with TypeScript analysis enabled
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    And I fill the primary pane with long split-test source
    And I disable smoothing and set scroll speed to one and a half
    And I open the repository file "other.ts"
    And I request animated split motion
    And I open tab "main.ts" in split view
    Then the right split scrolls and keeps its minimap bounded
    When I open the repository file "main.ts"
    And I open the repository file "other.ts"
    Then the right split scrolls and keeps its minimap bounded
