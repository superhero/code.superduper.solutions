# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@editor-settings
Feature: Editor preference validation and inheritance
  @ai-input-settings
  Scenario: AI input preferences default validate inherit and stay outside file overrides
    Then AI input settings preserve defaults and repository inheritance

  Scenario Outline: Invalid persisted settings recover the defaults
    Then persisted settings <input> resolve to clean defaults
    Examples:
      | input       |
      | null        |
      | false       |
      | "corrupt"   |
      | []          |
      | {}          |

  Scenario Outline: Invalid override records cannot introduce preferences
    Then the override record <input> is discarded
    Examples:
      | input       |
      | null        |
      | "corrupt"   |
      | []          |

  Scenario: Valid preferences survive normalization without retaining unknown keys
    Then valid editor preferences survive normalization as a fresh object

  Scenario: Legacy global Tab preferences migrate to indentation without losing other settings
    Then legacy global Tab preferences migrate once while preserving other settings and scoped choices

  Scenario: Explicit Tab focus preferences survive versioned settings roundtrips
    Then versioned Tab focus preferences survive normalization and serialization

  Scenario: Invalid field values do not replace inherited preferences
    Then malformed editor preference fields are discarded

  Scenario Outline: Numeric preferences are bounded and integer preferences are rounded
    Then preference "<property>" with value <input> normalizes to <expected>
    Examples:
      | property   | input | expected |
      | fontSize   | 1     | 7        |
      | fontSize   | 100   | 32       |
      | fontSize   | 17.6  | 18       |
      | lineHeight | 0.5   | 1.2      |
      | lineHeight | 10    | 2.4      |
      | lineHeight | 1.85  | 1.85     |
      | scrollSpeed | 0.1  | 0.25     |
      | scrollSpeed | 99   | 5        |
      | scrollSpeed | 1.75 | 1.75     |
      | indentSize | 0     | 0        |
      | indentSize | 20    | 12        |
      | indentSize | 3.7   | 4        |
      | tabSize    | 0     | 0        |
      | tabSize    | 20    | 12        |
      | tabSize    | 3.2   | 3        |

  Scenario Outline: Invalid repository preference collections are ignored
    Then repository preference collection <input> is ignored
    Examples:
      | input       |
      | null        |
      | "corrupt"   |
      | []          |

  Scenario: Repository preferences override only explicitly selected defaults
    Then repository preferences inherit global changes without leaking between repositories

  Scenario: Dangerous repository keys cannot change the settings prototype
    Then prototype-related repository keys are removed from persisted settings

  Scenario Outline: Invalid file preference collections are ignored
    Then file preference collection <input> is ignored
    Examples:
      | input       |
      | null        |
      | "corrupt"   |
      | []          |

  Scenario: File overrides retain only supported editor properties
    Then file preferences reject malformed records and unsupported visual overrides

  Scenario: File settings take precedence over EditorConfig and repository defaults
    Then file preferences inherit through every supported settings layer

  Scenario Outline: Automatic syntax mode follows the file extension
    Then "<path>" selects the "<language>" syntax mode automatically
    Examples:
      | path               | language   |
      | src/main.js        | javascript |
      | src/main.JSX       | javascript |
      | src/main.mjs       | javascript |
      | src/main.cjs       | javascript |
      | src/main.ts        | typescript |
      | src/main.tsx       | typescript |
      | src/main.mts       | typescript |
      | src/main.cts       | typescript |
      | src/App.svelte     | svelte     |
      | index.html         | html       |
      | index.htm          | html       |
      | styles.css         | css        |
      | package.json       | json       |
      | README.md          | markdown   |
      | notes.markdown     | markdown   |
      | LICENSE            | text       |
      | notes.unknown      | text       |
      |                    | text       |

  Scenario: Legacy language overrides no longer force a language
    Then legacy language overrides cannot force a language for unrelated filenames

  Scenario: Zero and mixed indentation settings configure the editor safely
    Then zero and mixed indentation settings create valid editor states

  Scenario: Successful package installations activate personal support and preserve repository choices
    Then installed packages activate their personal settings without changing repository overrides

  Scenario: Package defaults choose the first provider while preserving explicit selections
    Then package defaults select the first provider without replacing explicit choices

  Scenario: Cataloged Google editor fonts survive settings validation
    Then cataloged Google editor fonts survive settings validation without arbitrary families

  Scenario: Fresh editor defaults use bundled JetBrains Mono at thirteen pixels
    Then fresh editor defaults use bundled JetBrains Mono at thirteen pixels without replacing saved choices

  Scenario: Interface Google font choices include sans-serif and monospace without widening editor fonts
    Then interface Google font choices include sans-serif and monospace without widening editor fonts

  Scenario: Compact fonts are absent from interface and editor font choices
    Then compact fonts cannot be selected for the interface or editor

  Scenario: Per-file automatic history retention validates and inherits its limits
    Then history limits default to three hundred and support bounded per-file overrides

  Scenario: Custom keyboard shortcuts validate persist and inherit independently
    Then keybinding choices preserve disabled commands and repository overrides

  Scenario: Shortcut matching is portable and detects physical key conflicts
    Then shortcut matching distinguishes modifiers contexts and conflicting actions

  Scenario: Middle click is a configurable tab close binding
    Then middle click closes only the pointed tab when its binding is enabled

  Scenario: Zoom wheel bindings validate and inherit with keyboard alternatives
    Then zoom wheel shortcuts are restricted to zoom actions and preserve modifiers

  Scenario Outline: Toolbar button visibility inherits repository choices and preserves old defaults
    Then toolbar button preference "<key>" is validated and inherited without file overrides
    Examples:
      | key               |
      | showSettingsUndoButton |
      | showSettingsRedoButton |
      | showSettingsResetButton |
      | showSettingsKeybindingsResetButton |
      | showHistoryUndoButton |
      | showHistoryRedoButton |
      | showUndoButton    |
      | showRedoButton    |
      | showZoomOutButton |
      | showZoomInButton  |
      | showFormatButton  |
      | showDiffButton    |
      | showCommitHistoryButton |
      | showStagedHistoryButton |
      | showCommitButton |
      | showGitButton |
      | showHistoryCommitButton |
      | showHistoryGitButton |

  Scenario: New settings use the chosen dark Bonfire defaults
    Then new settings match the chosen appearance and typography defaults
