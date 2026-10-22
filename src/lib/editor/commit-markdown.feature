# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@commit-markdown
Feature: Safe Markdown in commit messages
  Scenario: Hashtags remain distinct from Markdown headings
    Then commit hashtags support words numbers and internal separators without replacing headings

  Scenario: Markdown contexts keep literal hashes out of commit tags
    Then escaped hashes code URLs and link labels stay outside commit tag styling

  Scenario: Standard Markdown structure renders in commit text
    Then commit Markdown preserves emphasis lists quotations and fenced code

  Scenario: Commit content cannot inject markup or request remote images
    Then commit Markdown escapes HTML blocks unsafe URLs and image markup

  Scenario: Commit links open only explicit external destinations
    Then commit Markdown permits safe external links without inventing local routes

  Scenario: Blank lines separate paragraphs without adding empty rows
    Then commit Markdown separates paragraphs while preserving code and single line breaks
