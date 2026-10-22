# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Local syntax language catalog
  Scenario: Every selectable language loads locally and retains a unique persisted preference
    Then the catalog provides at least 50 usable local syntax modes

  Scenario: Reopening files reuses language support without changing the requested mode
    Then syntax loading caches parsers and preserves explicit choices

  Scenario Outline: Common source and configuration names select their language
    Then "<path>" selects the "<language>" syntax mode automatically
    Examples:
      | path                      | language     |
      | src/main.py               | python       |
      | src/main.RS               | rust         |
      | src/main.go               | go           |
      | src/main.cpp              | cpp          |
      | include/main.HPP          | cpp          |
      | src/main.c                | c            |
      | src/Program.cs            | csharp       |
      | src/Main.java             | java         |
      | src/Main.kt               | kotlin       |
      | src/main.swift            | swift        |
      | src/main.dart             | dart         |
      | scripts/run.sh            | shell        |
      | scripts/run.ps1           | powershell   |
      | config/app.YML            | yaml         |
      | Cargo.toml                | toml         |
      | styles/main.scss          | scss         |
      | styles/main.sass          | sass         |
      | styles/main.less          | less         |
      | src/App.vue               | vue          |
      | data/schema.sql           | sql          |
      | data/schema.xml           | xml          |
      | src/index.php             | php          |
      | src/main.rb               | ruby         |
      | src/main.lua              | lua          |
      | src/main.pl               | perl         |
      | src/main.r                | r            |
      | src/main.jl               | julia        |
      | src/main.scala            | scala        |
      | src/main.groovy           | groovy       |
      | src/main.clj              | clojure      |
      | src/main.cljs             | clojurescript |
      | src/main.hs               | haskell      |
      | src/main.fs               | fsharp       |
      | src/main.ml               | ocaml        |
      | src/main.erl              | erlang       |
      | src/main.elm              | elm          |
      | src/main.pas              | pascal       |
      | src/main.f90              | fortran      |
      | src/main.cob              | cobol        |
      | src/main.d                | d            |
      | src/main.cr               | crystal      |
      | src/main.lisp             | common-lisp  |
      | src/main.scm              | scheme       |
      | src/main.tcl              | tcl          |
      | src/main.vb               | vb-net       |
      | src/main.vhdl             | vhdl         |
      | src/main.sv               | systemverilog |
      | src/main.s                | gas          |
      | src/main.wat              | webassembly  |
      | templates/main.pug        | pug          |
      | docs/main.tex             | latex        |
      | schema/main.proto         | protobuf     |
      | tests/main.feature        | gherkin      |
      | src/main.cmake.in         | cmake        |
      | build/CMAKELISTS.TXT       | cmake        |
      | images/DOCKERFILE         | dockerfile   |
      | scripts/gemfile           | ruby         |
      | ci/JENKINSFILE            | groovy       |
      | config/NGINX.dev.CONF      | nginx        |
      | package/BUILD             | python       |
      | directory.py/README       | text         |
      | query.GRAPHQL             | graphql      |
      | query.gql                 | graphql      |
      | schema.graphqls           | graphql      |
      | shaders/main.WGSL         | wgsl         |
      | infra/main.tf             | hcl          |
      | infra/config.hcl          | hcl          |
      | infra/dev.tfvars          | hcl          |
      | templates/page.hbs        | handlebars   |
      | templates/page.HANDLEBARS | handlebars   |
      | build/GNUmakefile         | makefile     |
      | BSDmakefile               | makefile     |
      | makefile                  | makefile     |
      | Makefile.am               | makefile     |
      | Makefile.in               | makefile     |
      | config/rules.MK           | makefile     |
      | config/rules.mak          | makefile     |
      | config/rules.make         | makefile     |
      | Makefile                  | makefile     |

  Scenario: Included GraphQL and WGSL syntax works without language intelligence
    Then GraphQL and WGSL provide structured syntax highlighting without language engines

  Scenario: Optional syntax activation supports personal defaults and repository overrides
    Then optional syntax choices preserve repository inheritance and reject unknown packages

  Scenario: Stable Handlebars highlights templates and provides native block behavior
    Then Handlebars expressions HTML and comments parse locally with folding and indentation

  Scenario: Basic Makefile syntax loads locally and is reused for Markdown fences
    Then Makefile targets comments and recipes have local syntax support

  Scenario: Filename suffix mappings are safe specific and preserve builtin names
    Then filename mappings normalize safely and choose the longest matching suffix

  Scenario: Filename mappings inherit per suffix and configure all language consumers
    Then filename mappings inherit by suffix and route engines and formatters consistently

  Scenario: Filename mapping choices follow repository suffixes or common defaults
    Then filename mapping choices show only relevant repository suffixes

  Scenario: Every syntax language can be disabled with inherited persistent preferences
    Then all syntax languages support disabling and repository overrides
