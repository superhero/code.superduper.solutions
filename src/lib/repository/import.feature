# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Import linked repository Git metadata
  Scenario Outline: Ordinary directories do not request a second directory
    Then importing "<kind>" finds no Git directory link
    Examples:
      | kind                    |
      | an empty directory      |
      | ordinary working files  |
      | a complete Git directory |
      | nested Git links        |

  Scenario Outline: Linked metadata paths are display hints and retain their spelling
    Then the "<kind>" Git directory link retains its path without accessing it
    Examples:
      | kind                |
      | relative submodule  |
      | absolute Unix       |
      | absolute Windows    |
      | spaces and Unicode  |
      | CRLF ending         |
      | no newline          |

  Scenario Outline: Invalid Git directory links cannot masquerade as complete imports
    Then the "<kind>" Git directory link is rejected with an actionable error
    Examples:
      | kind                 |
      | missing prefix       |
      | empty path           |
      | whitespace path      |
      | multiple lines       |
      | extra final newline  |
      | carriage return      |
      | tab                  |
      | DEL                  |
      | binary NUL           |
      | invalid UTF-8        |
      | duplicate link       |

  Scenario: Selecting linked metadata preserves working files and every supplied Git byte
    Then attaching Git metadata preserves working changes, binary objects, refs and the index

  Scenario Outline: Metadata attachment rejects incomplete or ambiguous selections
    Then attaching the "<kind>" Git metadata selection is rejected
    Examples:
      | kind                         |
      | absent Git link              |
      | malformed Git link           |
      | existing Git metadata        |
      | missing HEAD                 |
      | repository instead of metadata |
      | traversal                    |
      | absolute metadata path       |
      | backslash                    |
      | empty metadata path          |
      | nested Git metadata          |
      | duplicate metadata           |

  Scenario: Import assembly leaves unrelated duplicate paths for the repository engine to reject
    Then attaching Git metadata retains duplicate working files without overwriting them
