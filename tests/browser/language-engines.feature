# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@language-engines
Feature: Optional local language intelligence
  Scenario Outline: The <engine> engine is explicitly installed and activated
    Given the "<engine>" language intelligence repository is imported
    When I install and activate its language engine
    When I activate its language engine
    Then the language engine provides its supported editor feedback
    And language analysis does not change repository histories
    When I reload and use the installed language engine offline
    Then the language engine provides its supported editor feedback
    When I disable its language engine for this repository
    Then its language feedback clears without removing its installation
    Examples:
      | engine     |
      | typescript |
      | html       |
      | css        |
      | json       |
      | yaml       |
      | markdown   |
      | graphql    |
      | dockerfile |
      | postgres   |
      | toml       |
      | wgsl       |
      | liquid     |
  Scenario: Engine rows provide notices updates uninstall and reinstallation
    Given the "json" language intelligence repository is imported
    When I install and activate its language engine
    Then engine rows provide notices updates uninstall and reinstallation
  Scenario: Accepting an engine completion uses normal Git-backed undo
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then a TypeScript property completion is one undoable document edit
  Scenario: YAML analysis follows edits and Git-backed undo
    Given the "yaml" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then the language engine provides its supported editor feedback
    And correcting the YAML value clears diagnostics and undo restores them
  Scenario: Dockerfile completion stays local and creates an undoable edit
    Given the "dockerfile" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then Dockerfile completion is undoable and registry lookups stay offline
  Scenario Outline: Local schemas supply offline <engine> completions
    Given the "<engine>" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then its local schema supplies an offline undoable completion
    Examples:
      | engine   |
      | postgres |
      | toml     |

  Scenario: Liquid uses bundled documentation and repository snippets offline
    Given the "liquid" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then Liquid documentation and repository completions work offline with undo

  Scenario: Liquid refuses remote custom check profiles
    Given Liquid configuration extends a remote profile
    And the "liquid" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then Liquid rejects the remote profile without requesting it

  Scenario: TypeScript supplemental notices are user readable
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    Then TypeScript supplemental attribution is available in shared notices

  Scenario: JavaScript type checking is opt-in while TypeScript stays strict
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    Then the installed engine checks plain JavaScript only when explicitly requested

  Scenario: Delayed engine completions never flash native duplicates
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then delayed engine keyword completions appear once without native duplicates

  Scenario: Native completions remain available without an installed engine
    Given a browser repository named "Native fallback" with an empty file "main.js"
    Then native keyword completions work without downloading an engine

  Scenario: Completion arrow keys work immediately when results appear
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then arrow keys select completions immediately without moving the code cursor

  Scenario: Completion navigation stays in the popup while refreshed results are pending
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then completion arrows stay out of the document while results refresh
    And cached completions still replace the whole word after further typing

  Scenario: Autocomplete reuses unchanged repository files across saved edits
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then saved edits do not reread unchanged files for autocomplete

  Scenario: Unchecked JavaScript identifiers do not become completion suggestions
    Given the "javascript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then JavaScript completion excludes unchecked identifier guesses

  Scenario: Enter accepts the first completion even while results refresh
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then Enter accepts the first completion while results refresh without inserting a newline

  Scenario: Method completions insert call parentheses without duplication
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then method completions insert parentheses once and place the cursor inside

  Scenario: Conditional snippets remain available alongside semantic completions
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then if and if-else completions insert editable conditional blocks

  Scenario: Fuzzy completion gaps are struck through only between matched characters
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then fuzzy completion labels emphasize matches and strike only internal gaps

  Scenario: Completion filtering excludes large gaps as the typed prefix changes
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then completion matching allows two skipped letters but excludes larger gaps

  Scenario: Method hover separates signature metadata and documentation
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then method hover presents structured readable documentation

  Scenario: Documentation-only TypeScript hover renders its first paragraph as Markdown
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then import meta hover formats inline code throughout its documentation

  Scenario Outline: Empty hover replies stay hidden for <engine> while useful information remains available
    Given the "<engine>" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then empty language hover replies stay hidden while useful replies remain visible
    Examples:
      | engine     |
      | typescript |
      | html       |

  Scenario: Node types are explicitly installed before providing offline globals and module declarations
    Given the "node" language intelligence repository is imported
    When I install and activate its language engine
    Then additional type libraries are offered without being downloaded or enabled
    When I install and enable the "Node.js" type library
    And I activate its language engine
    Then Node declarations provide offline globals and built-in modules

  Scenario: Node globals remain unavailable without opting into Node types
    Given the "browserTypes" language intelligence repository is imported
    When I install and activate its language engine
    And I activate its language engine
    Then Node globals remain unavailable in this browser or explicitly restricted repository

  Scenario: Explicit compiler types still restrict an enabled Node type library
    Given the "nodeTypesDisabled" language intelligence repository is imported
    When I install and activate its language engine
    And I install and enable the "Node.js" type library
    And I activate its language engine
    Then Node globals remain unavailable in this browser or explicitly restricted repository

  Scenario: Type library choices inherit and persist without reinstalling their packages
    Given the "node" language intelligence repository is imported
    When I install and activate its language engine
    And I install and enable the "Node.js" type library
    Then type library repository overrides survive reload without changing personal defaults
    And Node declarations provide offline globals and built-in modules

  Scenario: Explicit compiler libraries still restrict an enabled DOM type library
    Given the "browserTypesDisabled" language intelligence repository is imported
    When I install and activate its language engine
    And I install and enable the "Browser / DOM" type library
    And I activate its language engine
    Then explicit compiler libraries keep DOM globals unavailable

  Scenario Outline: Optional <library> types supply offline completions
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I install and enable the "<library>" type library
    And I activate its language engine
    Then the "<library>" type library supplies an offline completion
    Examples:
      | library       |
      | Browser / DOM |
      | Web Workers   |
      | ScriptHost    |

  Scenario: Type libraries can be exported removed and imported offline
    Given the "typescript" language intelligence repository is imported
    When I install and activate its language engine
    And I install and enable the "Browser / DOM" type library
    Then a type library export can be reimported offline and rejects modified declarations

  Scenario: Long Node documentation renders Markdown and stays inside its popup
    Given the "node" language intelligence repository is imported
    When I install and activate its language engine
    And I install and enable the "Node.js" type library
    And I activate its language engine
    Then long Node hover documentation is formatted and scrolls inside its frame
