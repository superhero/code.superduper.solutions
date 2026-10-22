# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

@scope-guide
Feature: The active bracket scope is visible without moving code
  Background:
    Given a browser repository named "Bracket scopes" with an empty file "main.js"

  Scenario: Nested bracket endpoints select the matching scope without changing code geometry
    Given the editor contains nested functions for scope guide checks
    When I place the scope-guide caret after the inner opening brace
    Then the scope guide joins the inner braces without moving the code
    When I place the scope-guide caret after the inner closing brace
    Then the scope guide joins the inner braces without moving the code
    When I place the scope-guide caret after the outer opening brace
    Then the scope guide joins the outer braces without moving the code
    When I place the scope-guide caret after the outer closing brace
    Then the scope guide joins the outer braces without moving the code
    When I move the scope-guide caret away from brackets
    Then no active bracket scope guide is drawn
    When I place the scope-guide caret beside single-line parentheses
    Then no active bracket scope guide is drawn

  Scenario: Bracket matching preferences and folded scopes clear the active guide
    Given the editor contains nested functions for scope guide checks
    When I place the scope-guide caret after the outer opening brace
    Then the scope guide joins the outer braces without moving the code
    When I turn bracket matching off for scope guide checks
    Then no active bracket scope guide is drawn
    When I turn bracket matching on for scope guide checks
    Then the scope guide joins the outer braces without moving the code
    When I collapse the outer function for scope guide checks
    Then no active bracket scope guide is drawn

  Scenario: A long active scope remains visible when its bracket endpoints leave the viewport
    Given the editor contains a scope with 200 body lines
    When I place the scope-guide caret after the long scope closing brace
    Then the scope guide reaches the closing brace with its opening brace offscreen
    When I scroll to the middle of the active long scope
    Then the scope guide spans the viewport while the caret remains at the closing brace
    When I scroll another 50 pixels within the active long scope
    Then the scope guide spans the viewport while the caret remains at the closing brace

  Scenario: Empty bracket pairs have no outline while spaced pairs retain it
    Then adjacent bracket pairs omit outlines and spaced pairs retain them
