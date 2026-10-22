# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@syntax-packages
Feature: Included and optional syntax highlighting
  Scenario: GraphQL and WGSL highlight without installing engines
    Given a repository with GraphQL WGSL and Terraform files is imported
    Then GraphQL and WGSL highlight without package downloads

  Scenario: HCL syntax is installed explicitly and works offline with repository overrides
    Given a repository with GraphQL WGSL and Terraform files is imported
    When I install and activate HCL syntax
    Then Terraform highlights immediately after installation
    When I enable HCL syntax and reload offline
    Then Terraform has structured syntax highlighting
    When I disable HCL syntax for this repository
    Then Terraform is plain text and undo restores its highlighting
    And the syntax pane supports shared notices uninstall and reinstallation

  Scenario: Stable Handlebars supports mixed HTML templates without downloads
    Given a repository with Handlebars templates is imported
    Then stable Handlebars highlights HTML and templates and folds its blocks without downloads

  Scenario: Installing the Handlebars beta activates it with stable fallback on removal
    Given a repository with Handlebars templates is imported
    When I install and activate the Handlebars beta
    And I select the Handlebars beta and reload offline
    Then the Handlebars beta remains selected and repository overrides are undoable
    And removing the Handlebars beta restores stable highlighting

  Scenario: Included syntax highlighting can be disabled and restored per repository
    Given a repository with GraphQL WGSL and Terraform files is imported
    Then included syntax settings list all languages and disabling GraphQL persists
