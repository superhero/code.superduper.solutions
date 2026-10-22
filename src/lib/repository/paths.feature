# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Repository path and text boundaries
  Scenario Outline: Ordinary file names retain their exact spelling
    Then repository file path "<path>" is accepted unchanged
    Examples:
      | path                  |
      | README.md             |
      | src/lib/example.ts    |
      | résumé/日本語.txt     |
      | .gitignore            |

  Scenario Outline: Unsafe paths cannot reach repository internals
    Then the "<case>" repository file path is rejected
    Examples:
      | case             |
      | empty            |
      | non-string       |
      | absolute         |
      | backslash        |
      | NUL              |
      | newline          |
      | DEL              |
      | dot              |
      | parent           |
      | inner parent     |
      | repeated slash   |
      | trailing slash   |
      | git directory    |
      | git metadata     |
      | mixed-case Git   |
      | nested Git       |

  Scenario: A full import can include the source Git directory
    Then only root Git metadata paths are accepted for imports

  Scenario Outline: Rejected Git imports identify the path and recovery action
    Then the imported path "<path>" explains "<explanation>"
    Examples:
      | path                    | explanation                                    |
      | nested/.git/config      | Select that repository's directory separately  |
      | nested/.git             | Select that repository's directory separately  |
      | .git                    | select its Git metadata when prompted          |
      | .GIT/config             | must use the exact name .git                   |
      | nested/.GiT/HEAD         | must use the exact name .git                   |
      | .git/nested/.git/config  | cannot contain another .git path               |

  Scenario: Repository identities cannot become filesystem paths
    Then stable repository identities produce separate source and history paths

  Scenario: UTF-8 editing preserves Unicode and byte order marks
    Then UTF-8 text round trips without changing its bytes

  Scenario Outline: Unsupported binary input is preserved instead of decoded as replacement characters
    Then the "<case>" byte sequence is rejected by text reading
    Examples:
      | case         |
      | NUL          |
      | invalid UTF8 |

  Scenario Outline: Text writes cannot introduce binary values
    Then the "<case>" text write is rejected
    Examples:
      | case       |
      | NUL        |
      | non-string |
