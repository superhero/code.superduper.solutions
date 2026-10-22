# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.

Feature: Application startup
  Scenario: The supplied component mounts into the application target
    Given a document with an application mount target
    When the application starts
    Then the supplied component is mounted exactly once into the target

  Scenario: Startup returns the component mounting result
    Given a document with an application mount target
    When the application starts
    Then startup returns the original mounting result

  Scenario: A missing target prevents mounting
    Given a document without an application mount target
    When the application starts
    Then startup fails with "Missing #app element" before mounting

  Scenario: Mounting failures retain their identity and cause
    Given a document with an application mount target
    And a component that fails to mount
    When the application starts
    Then startup propagates the original mounting failure
