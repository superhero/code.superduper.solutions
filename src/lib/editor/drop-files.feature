# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Files and folders dropped from the computer
  Scenario: Dropped folders retain their roots, Unicode names, hidden files and binary bytes
    Then dropped entries retain their complete hierarchy and original bytes

  Scenario: Folder traversal reads every browser batch including the final partial batch
    Then a dropped folder with 101 entries is read until the empty batch

  Scenario Outline: Browser entries are captured before the drop event loses access
    Then the drop adapter captures all "<method>" entries before asynchronous traversal
    Examples:
      | method            |
      | webkitGetAsEntry  |
      | getAsEntry        |

  Scenario: Native files remain readable after the browser protects the item list
    Then dropped item files are captured together before their bytes are read

  Scenario: A browser without entry APIs can supply files and relative paths
    Then the drop adapter accepts FileList fallback paths without losing bytes

  Scenario Outline: A read failure rejects the complete drop
    Then a dropped "<failure>" failure returns no partial file list
    Examples:
      | failure          |
      | file callback    |
      | folder callback  |
      | file bytes       |
      | entry capture    |
      | unavailable file |

  Scenario: Unreadable entry kinds cannot be silently skipped
    Then unsupported dropped entries reject the complete drop

  Scenario: Unsafe relative paths cannot escape the drop target
    Then dropped entries and fallback files reject unsafe paths

  Scenario: Git metadata requires the existing repository import workflow
    Then dropped Git metadata is rejected with history-preserving import guidance

  Scenario: Empty drops and empty folders do not manufacture repository content
    Then drops without files explain that empty folders are not versioned
