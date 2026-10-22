# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
@repository-core @remote-git
Feature: Full-history remote Git in the browser repository engine
  # The transport is a local git-http-backend process over stdin/stdout.
  # No test sends a network request or writes to an actual upstream.
  Scenario: Remote clone retains all branches tags and historical objects
    Then remote clone preserves full history binary files and independent editor history

  Scenario: Remote fetch is independent of files and pull uses the existing undo path
    Then remote fetch preserves edits and fast-forward pull records one reversible file change

  Scenario: Remote push transmits ordinary source history and rejects a stale lease
    Then remote push publishes only source refs and a changed lease prevents upload

  Scenario: A remote lease also protects the receive-pack race
    Then a remote change after advertisement rejects the push atomically

  Scenario Outline: Remote fetch recovers after the <stage> checkpoint without networking
    Then remote fetch interrupted at "<stage>" recovers without another network request
    Examples:
      | stage         |
      | prepared      |
      | files-flushed |
      | refs-flushed  |
      | finalized     |

  Scenario: A successful remote push recovers its local receipt without replaying the write
    Then interrupted remote push recovery never replays the upstream write

  Scenario: Unsafe imported fetch refspecs cannot rewrite local branches
    Then remote fetch replaces unsafe imported refspecs and never changes local heads

  Scenario: Cancelling a remote clone leaves no published or partial repository
    Then a cancelled remote clone cleans up its unpublished filesystem

  Scenario: A remote branch becomes a local tracking branch through the normal journal
    Then checking out a remote branch preserves files history and tracking configuration

  Scenario: Remote branch and tag publication preserve local references
    Then remote branch and tag pushes and deletions preserve local refs and file history

  Scenario: A reviewed lease can replace a diverged upstream
    Then a matching lease replaces the upstream tip and rejects unknown operations

  Scenario: Imported remote URL credentials never appear in status or errors
    Then imported URL credentials are hidden and unsafe transfers are refused
