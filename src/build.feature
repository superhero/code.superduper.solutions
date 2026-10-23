# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Standalone production build
  Scenario: Optional browser inference retains the selected source build and notices outside the page
    Given the production build has completed
    Then optional browser inference files retain pinned runtime bytes and publisher notices
  Scenario: Upstream JavaScript libraries install as separate verified packages
    Given the production build has completed
    Then upstream integrations are self-contained verified packages with complete notices
  Scenario: The release contains one page hosting metadata and favicon assets
    Given the production build has completed
    Then the distribution contains only the page hosting headers and favicon assets
    And the hosting headers enable cross-origin isolation

  Scenario: The entry point retains its application identity
    Given the production build has completed
    Then the built page has the code editor title and application mount target

  Scenario: JavaScript and styles are embedded
    Given the production build has completed
    Then the built page embeds its JavaScript and CSS without external entry assets

  Scenario: Local fonts remain inside the page
    Given the production build has completed
    Then the production fonts are embedded rather than fetched remotely

  Scenario: Development tooling is absent from releases
    Given the production build has completed
    Then the built page excludes development clients overlays and toolbars

  Scenario: Inline worker dependencies retain full notices
    Then the worker inventory retains full licenses from its actual module graph

  Scenario: Worker dependencies cannot silently escape the license inventory
    Then an unaccounted worker inventory fails the build

  Scenario: Optional formatters retain their WebAssembly dependency notices
    Given the production build has completed
    Then the formatter packages retain their WebAssembly notices in full

  Scenario: Optional formatter packages are versioned complete and separate from the page
    Given the production build has completed
    Then optional formatter packages match their catalog and have no external module imports

  Scenario: Every production download fits Cloudflare Pages asset limits
    Given the production build has completed
    Then every static download fits Pages and large optional packages retain verified parts

  Scenario Outline: The standalone page preserves the full <source> notice
    Given the production build has completed
    Then the embedded notice for "<source>" preserves "<path>" in full
    Examples:
      | source                                               | path                                                   |
      | LICENSE                                              | LICENSE                                                |
      | LICENSE-ADDITIONAL-TERMS                             | LICENSE-ADDITIONAL-TERMS                                |
      | src/assets/fonts/Montserrat-OFL.txt                  | src/assets/fonts/Montserrat-OFL.txt                     |
      | src/assets/fonts/Rationale-OFL.txt                   | src/assets/fonts/Rationale-OFL.txt                      |
      | src/assets/fonts/Material-Symbols-Apache-2.0.txt     | src/assets/fonts/Material-Symbols-Apache-2.0.txt          |
      | src/assets/fonts/Devicon-MIT.txt                    | src/assets/fonts/Devicon-MIT.txt                        |
      | src/lib/components/ui/LICENSE.shadcn-svelte          | src/lib/components/ui/LICENSE.shadcn-svelte             |
      | npm:svelte                                          | node_modules/svelte/LICENSE.md                         |
      | npm:@visulima/pail                                  | node_modules/@visulima/pail/LICENSE.md                  |
      | npm:@visulima/colorize                              | node_modules/@visulima/colorize/LICENSE.md              |
      | npm:tailwindcss                                    | node_modules/tailwindcss/LICENSE                       |
      | npm:tw-animate-css                                 | node_modules/tw-animate-css/LICENSE                    |
      | npm:@codemirror/state | node_modules/@codemirror/state/LICENSE |
      | npm:@codemirror/view | node_modules/@codemirror/view/LICENSE |
      | npm:codemirror-lang-makefile | node_modules/codemirror-lang-makefile/LICENSE |
      | npm:@xiechao/codemirror-lang-handlebars | node_modules/@xiechao/codemirror-lang-handlebars/LICENSE |
      | npm:@replit/codemirror-lang-svelte | node_modules/@replit/codemirror-lang-svelte/LICENSE |
      | npm:isomorphic-git | node_modules/isomorphic-git/LICENSE.md |
      | npm:@isomorphic-git/lightning-fs | node_modules/@isomorphic-git/lightning-fs/LICENSE |
      | npm:idb | node_modules/idb/LICENSE |
      | npm:buffer | node_modules/buffer/LICENSE |
      | npm:clean-git-ref | build/licenses/clean-git-ref-2.0.1.txt |
      | npm:diff3 | build/licenses/diff3-0.0.3.txt |
      | npm:hash-wasm | node_modules/hash-wasm/LICENSE |
      | npm:@mdit/plugin-tasklist | node_modules/@mdit/plugin-tasklist/LICENSE |
      | npm:@mdit/plugin-footnote | node_modules/@mdit/plugin-footnote/LICENSE |
      | npm:@mdit/plugin-mark | node_modules/@mdit/plugin-mark/LICENSE |
      | npm:@mdit/plugin-katex | node_modules/@mdit/plugin-katex/LICENSE |
      | npm:katex | node_modules/katex/LICENSE |
      | src/lib/secrets/NOTICES.md | src/lib/secrets/NOTICES.md |

  Scenario Outline: Pinned package notice fallbacks require their reviewed identity and source
    Then the worker packager rejects a "<failure>" notice fallback
    Examples:
      | failure             |
      | changed version     |
      | changed declaration |
      | changed source      |

  Scenario Outline: An incomplete dependency inventory fails the build
    Then the packager rejects a "<failure>" license inventory without altering the page
    Examples:
      | failure      |
      | missing      |
      | empty        |
      | missing text |
      | empty text   |

  Scenario: Upstream notice text cannot escape its inert container
    Then notice markup is escaped without losing its original text

  Scenario: Parser examples are not mistaken for executable page markup
    Then HTML examples in bundled scripts survive notice insertion

  Scenario Outline: Unhandled bundle shapes fail before intermediate assets are removed
    Then the packager rejects "<failure>" instead of discarding executable assets
    Examples:
      | failure                  |
      | another executable chunk |
      | an external import       |
      | a dynamic import         |
      | a runtime self import    |
      | an unowned blob import   |
      | an arbitrary syntax import |
      | split stylesheets        |

  Scenario: Inlined lazy modules do not count as external executable chunks
    Then inlined lazy modules retain their licenses without leaving executable assets
  Scenario: Optional language engines remain separate and retain complete notices
    Given the production build has completed
    Then language engine packages match their trusted catalog without external imports

  Scenario: Additional type libraries ship as separate verified data packages
    Given the production build has completed
    Then type library packages contain declarations and notices outside the engine and core HTML

  Scenario: HCL syntax is an optional standalone package
    Given the production build has completed
    Then optional HCL syntax stays separate with verified metadata and complete notices

  Scenario: The Handlebars beta remains an optional standalone package
    Given the production build has completed
    Then the Handlebars beta is a verified separate package with its complete upstream notice
