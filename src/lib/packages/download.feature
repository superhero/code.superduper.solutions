# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
Feature: Optional packages are bounded verified static downloads
  Scenario: A single static package retains its original bytes
    Then a single optional package downloads with bounded progress

  Scenario: An oversized package is delivered as verified Pages sized parts
    Then a large optional package is split and reassembled without changing its checksum

  Scenario Outline: Invalid part responses never produce an installable package
    Then the optional package downloader rejects a "<failure>" response
    Examples:
      | failure   |
      | missing   |
      | truncated |
      | oversized |
      | corrupt   |

  Scenario: Cancelling a package stops before requesting its next part
    Then cancelling an optional package download cancels its reader and stops subsequent parts

  Scenario Outline: Inconsistent transport metadata is rejected before network access
    Then the optional package downloader rejects "<failure>" metadata without fetching
    Examples:
      | failure         |
      | empty parts     |
      | incorrect total |
      | invalid size    |
