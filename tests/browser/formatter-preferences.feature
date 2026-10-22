# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@formatter-preferences
Feature: Users select optional formatters per language
  Scenario Outline: Optional <provider> formats with the selected provider in the browser
    Given the optional "<provider>" provider sample is imported and selected
    When I format the current document
    Then the selected provider produced one formatting change
    And the source Git history is unchanged
    Examples:
      | provider                    |
      | dprint-pretty-yaml          |
      | dprint-malva                |
      | dprint-markup               |
      | dprint-pretty-graphql       |
      | dprint-gofumpt              |
      | dprint-typstyle             |
      | dprint-sh                   |
      | dprint-nix                  |
      | dprint-kdl                  |
      | dprint-lax-sql              |
      | dprint-lax-markup           |
      | dprint-lax-css              |
      | dprint-typstyle-apcamargo    |
      | dprint-bibtex-tidy           |
      | dprint-clang-format         |
      | dprint-panache              |
      | dprint-badness              |
      | dprint-fatou                |
      | dprint-arity                |
      | dockerfile-service          |
      | postgres-service            |
      | wgsl-service                |

  Scenario: Installing alternatives activates them while comparison preserves the selection
    When I view the formatter installation settings
    And I install the "Typstyle (kachick)" formatter package
    And I install the "Typstyle (apcamargo)" formatter package
    Then the Typst formatter selection is "dprint-typstyle-apcamargo"
    When I select "dprint-typstyle-apcamargo" as the personal formatter for "Typst"
    And I compare installed Typst formatters
    Then both Typst timings are visible without changing the selection
    When I reload the formatter preferences
    Then both Typst timings are visible without changing the selection

  Scenario: Repository formatter choices inherit and participate in undo and redo
    Given a browser repository named "Scoped formatters" with an empty file "main.yaml"
    When I view the formatter installation settings
    And I select "dprint-pretty-yaml" as the personal formatter for "YAML"
    And I select "none" as the repository formatter for "YAML"
    Then the YAML formatter selection is "none"
    When I undo the formatter preference change
    Then the YAML formatter selection is "inherit"
    When I redo the formatter preference change
    Then the YAML formatter selection is "none"
    When I reload the formatter preferences
    Then the YAML formatter selection is "dprint-pretty-yaml"
    When I inspect repository formatter preferences
    Then the YAML formatter selection is "none"

  Scenario: Embedded Markdown follows the user-selected YAML provider offline
    Given the Markdown YAML fence fixture uses Pretty YAML
    When I reload with all formatter downloads blocked
    And I format the current document
    Then the Markdown YAML fence was formatted without installing Prettier
