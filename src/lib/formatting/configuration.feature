# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Browser-safe repository formatter configuration
  Scenario: Repositories without formatter config retain editor defaults
    Then missing formatter configuration resolves without reading unrelated files
  Scenario: The nearest dprint JSONC config supplies independent plugin options
    Then nearest dprint configuration keeps global and plugin options without loading plugins
  Scenario: Dprint includes and excludes bound manual formatting
    Then dprint file filters honor relative globs negation and directories
  Scenario: Prettier reads JSON and YAML data formats
    Then prettier data configurations resolve from supported filenames
  Scenario: Nested Prettier configuration and package metadata follow local precedence
    Then prettier resolves nearest configuration and package options
  Scenario: Prettier overrides merge in order against paths relative to the config
    Then prettier overrides match basenames relative paths and exclusions
  Scenario: The repository ignore file preserves gitignore pattern semantics
    Then prettier ignore rules preserve escaped names negation and directory exclusions
  Scenario: Malformed configuration does not silently fall back
    Then malformed formatter data and option structures are rejected
  Scenario: Executable configuration cannot run repository code
    Then executable prettier configurations are rejected before their contents are read
  Scenario: External configuration loading is unavailable in the browser
    Then external formatter configs and inheritance are rejected explicitly
  Scenario: Repository plugin declarations cannot load executable code
    Then prettier accepts only bundled plugin declarations and rejects custom compiler paths
  Scenario: Whole-document formatting uses the selected language
    Then prettier parser options survive while path and partial formatting controls are rejected
  Scenario: Untrusted configuration remains bounded data
    Then formatter configuration rejects oversized cyclic and unsafe structures

  Scenario: Roslyn routing respects C sharp and Visual Basic file and language modes
    Then Roslyn is selected for C sharp and Visual Basic filenames and overrides

  Scenario: Jupyter notebooks use their cell-aware formatter instead of ordinary JSON
    Then Jupyter filenames select notebook formatting while explicit JSON still overrides it
  Scenario: Fourmolu resolves only local printer configuration
    Then fourmolu resolves nearest YAML printer options without native project configuration
