# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@ai-markdown-source
Feature: AI conversation Markdown
  Scenario: Model-written generated dates are separated from document content
    Then only a trailing generated-date footer is hidden from AI Markdown
  Scenario: LaTeX formulas render with dollar bracket and fenced delimiters
    Then AI Markdown renders inline and display math while preserving literal code
  Scenario: Math commands cannot load resources or leak between messages
    Then AI math stays inert bounded and isolated between messages
  Scenario: Conversation Markdown preserves prose lists tables and code
    Then AI Markdown renders its standard block and inline formatting
  Scenario: Conversation Markdown includes task lists footnotes and highlights
    Then AI Markdown renders the selected mdit plugins
  Scenario: Conversation text cannot execute markup or load embedded resources
    Then AI Markdown keeps markup URLs and images inert
  Scenario: Messages keep independent footnote and task identifiers
    Then AI Markdown identifiers are unique to each message
  Scenario: Streaming keeps completed blocks stable and resolves later references
    Then AI Markdown updates incomplete text without changing completed blocks

  Scenario Outline: The complete mdit catalog renders <plugin>
    Then the mdit "<plugin>" capability renders its configured syntax
    Examples:
      | plugin         |
      | abbr           |
      | advanced-links |
      | alert          |
      | align          |
      | anchor         |
      | attrs          |
      | container      |
      | demo           |
      | dl             |
      | embed          |
      | emoji          |
      | field          |
      | figure         |
      | icon           |
      | img-lazyload   |
      | img-mark       |
      | img-size       |
      | ins            |
      | layout         |
      | plantuml       |
      | ruby           |
      | spoiler        |
      | stylize        |
      | sub            |
      | sup            |
      | tab            |
      | uml            |

  Scenario: Conflicting plugin syntax and untrusted extension attributes stay contained
    Then mdit extensions preserve escaping scoped anchors and bounded attributes

  Scenario: Alternate image sizing grammars preserve their dimensions
    Then all mdit image sizing grammars retain dimensions without loading resources

  Scenario: Local MathJax renders with isolated bounded TeX and a bounded cache
    Then the MathJax plugin renders SVG without loading external resources

  Scenario: Include and snippet adapters match the upstream filesystem plugins
    Then browser Markdown imports preserve upstream line region and nested syntax

  Scenario: Repository imports are bounded isolated and cached
    Then Markdown imports stay within their repository and bound cycles and reads

  Scenario: The source editor recognizes extensions without replacing Markdown text
    Then the incremental composer grammar retains all source and recognizes mdit syntax

  Scenario: Streaming MathJax waits for a complete block before conversion
    Then incomplete streamed MathJax fences keep readable source without repeated conversion

  Scenario: Repeated explicit anchors cannot break a message or collide with tabs
    Then headings layouts and tabs retain unique scoped identifiers with repeated source anchors
