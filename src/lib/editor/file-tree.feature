# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Repository directory tree model
  Scenario: Files become a directory hierarchy with stable full paths
    Then the repository tree preserves nested Unicode paths and repeated basenames

  Scenario: Directories sort before files using natural numeric names at every depth
    Then tree siblings sort by kind and natural name independently of input order

  Scenario: Equivalent natural names use exact spelling as a deterministic tie break
    Then case accents and padded numbers retain distinct deterministically sorted names

  Scenario: Building the tree does not change the repository file list
    Then duplicate identical paths produce one tree leaf without changing the input

  Scenario Outline: A file cannot also be an ancestor directory
    Then the tree rejects a file-directory conflict with the "<order>" supplied first
    Examples:
      | order     |
      | file      |
      | directory |

  Scenario: Empty repositories have no tree nodes or visible rows
    Then empty file trees stay empty

  Scenario: Expansion controls depth-first visible rows without changing the tree
    Then visible tree rows include only descendants whose ancestors are expanded

  Scenario Outline: File ancestors appear from the repository root to the containing folder
    Then the ancestors of "<path>" are "<ancestors>"
    Examples:
      | path                        | ancestors                       |
      |                             |                                 |
      | README.md                   |                                 |
      | src/main.ts                 | src                             |
      | src/lib/editor/main.ts      | src,src/lib,src/lib/editor       |
      | résumé/日本語/README.md     | résumé,résumé/日本語             |

  Scenario: Invalid file paths cannot be reinterpreted as tree directories
    Then tree building and ancestor lookup reject unsafe paths

  Scenario: A file drag preview appears in its natural destination order
    Then file drag previews use the same natural names and exact spelling order as real files

  Scenario: A nested drag preview appears only inside its destination folder
    Then a drag preview uses its full destination path inside existing directories

  Scenario: Drag previews preserve source nodes and unrelated branches
    Then rendering a drag preview leaves the original tree unchanged and shares unaffected nodes

  Scenario: A directory drag preview sorts with directories before files
    Then directory drag previews have no children and use normal directory ordering

  Scenario Outline: Unavailable drag destinations leave the tree unchanged
    Then a "<destination>" drag preview returns the original tree
    Examples:
      | destination       |
      | absent preview    |
      | existing file     |
      | existing folder   |
      | nested collision  |
      | missing parent    |
      | nested missing    |
      | file parent       |

  Scenario: Drag previews reject unsafe repository paths
    Then drag previews cannot introduce unsafe paths
