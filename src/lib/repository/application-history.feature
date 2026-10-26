# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@application-history
Feature: Durable application-wide undo and redo
  @repository-lifecycle
  Scenario: Permanent repository deletion preserves unrelated undo, redo and settings
    Then deleting repository history removes every restoration path while another repository retains redo
  @auto-stash
  Scenario: History retention preserves automatic checkout stashes and their staging
    Then automatic checkout stashes survive history retention and application reload
  @history-messages
  Scenario: Application labels agree with grouped file summaries and explicit formatting
    Then application history uses the private edit subject for grouped edits and formatting
  @history-messages
  Scenario Outline: The formatting label survives interrupted persistence
    Then a formatting history subject recovers at "<stage>"
    Examples:
      | stage                    |
      | activity-prepared        |
      | repository-files-flushed |
      | activity-objects         |
  @edit-grouping
  Scenario: Grouped history survives retention while superseded intermediates are collected
    Then retention preserves grouped redo and collects replaced intermediate objects
  @edit-grouping
  Scenario: Invalid group metadata never leaves a pending save
    Then malformed edit groups are rejected before either private journal changes
  @edit-grouping
  Scenario Outline: Both private histories agree on the endpoints of a typing session
    Then grouped application edits undo and redo as one "<mode>" step
    Examples:
      | mode       |
      | repository |
      | unscoped   |
  @edit-grouping
  Scenario Outline: Application actions cannot silently extend an earlier typing group
    Then application edit grouping ends on "<boundary>"
    Examples:
      | boundary      |
      | navigation    |
      | settings      |
      | settings undo |
      | file undo     |
      | another file  |
      | multiline     |
  @edit-grouping
  Scenario Outline: Interrupted grouped entries recover both private timelines exactly once
    Then a grouped application amendment recovers at "<stage>"
    Examples:
      | stage                    |
      | activity-prepared        |
      | activity-repository      |
      | activity-objects         |
      | activity-refs            |
      | activity-finalized       |
      | repository-prepared      |
      | repository-files-flushed |
      | repository-refs-flushed  |
      | repository-finalized     |

  Scenario: Workspace actions and edits share chronology across repositories
    Then application history restores interleaved workspace settings and repository edits

  Scenario: History graph selection restores through undo redo and reload
    Then application history restores graph choices without creating repository revisions

  @select-history
  Scenario: Selecting a private revision participates in application undo and redo
    Then application history restores selected revisions and their workspace through reload

  @checkout-commit
  Scenario: Application undo of source checkout restores content without moving detached HEAD
    Then source commit checkout records content undo independently of source HEAD

  @checkout-commit
  Scenario Outline: Source checkout recovers across repository and application journals
    Then source commit checkout recovers an interruption at "<stage>"
    Examples:
      | stage                    |
      | activity-repository      |
      | repository-files-flushed |

  @select-history
  Scenario Outline: Interrupted private revision selections recover exactly once
    Then a history selection recovers an interruption at "<stage>"
    Examples:
      | stage                |
      | activity-prepared    |
      | activity-repository  |
      | activity-objects     |
      | activity-refs        |
      | activity-finalized   |
      | repository-prepared  |
      | repository-files-flushed |
      | repository-refs-flushed |
      | repository-finalized |

  Scenario Outline: Interrupted application actions recover exactly once
    Then application history recovers an interruption at "<stage>"
    Examples:
      | stage                |
      | activity-prepared    |
      | activity-repository  |
      | activity-objects     |
      | activity-refs        |
      | activity-finalized   |
      | repository-prepared  |

  Scenario: Abandoned futures stay reachable and stale writers cannot overwrite them
    Then application history retains divergent futures and rejects competing cursors

  Scenario: Existing repository undo survives the application-history migration
    Then legacy repository edits can be undone and redone around new workspace actions

  Scenario: Invalid actions do not poison application-history recovery
    Then rejected application actions leave the prior workspace usable

  Scenario: Validation rejections remain correctable while storage errors stay visible
    Then application validation errors are distinguished from storage failures

  Scenario: No-op commands preserve the application cursor and redo future
    Then unchanged application commands create no artificial history

  Scenario: Pre-upgrade redo survives reload and mixes with migrated undo
    Then existing repository redo joins application history without losing its order

  Scenario: A deliberate workspace action permanently abandons pre-upgrade redo
    Then only unchanged or rejected actions preserve legacy redo availability

  Scenario Outline: Interrupted legacy redo recovers exactly once
    Then legacy redo recovers an interruption at "<stage>"
    Examples:
      | stage                |
      | activity-prepared    |
      | activity-repository  |
      | activity-objects     |
      | activity-refs        |
      | activity-finalized   |
      | repository-prepared  |

  Scenario: Startup retention budgets each file independently without changing source Git
    Then automatic history retains the requested edits per file and consistent application undo

  Scenario: Zero retention preserves divergent endpoints and redo through compaction
    Then automatic history compaction preserves branch tips current files and redo at zero retention

  Scenario: Interrupted retention publication leaves the original histories usable
    Then unpublished history compaction is harmless and collection can finish after publication

  Scenario: Retention does not compact source checkout checkpoints below the edit budget
    Then retained checkout checkpoints still undo independently from source Git

  Scenario: Repository and settings undo preserve navigation and each other's redo across reload
    Then scoped history independently restores files and settings without replaying navigation

  Scenario: Global and repository settings have independent durable undo scopes
    Then settings scopes retain independent undo and redo paths

  Scenario: Scoped file undo recovers without changing settings or navigation
    Then scoped repository undo recovers its prepared journal independently

  Scenario: Startup retention remaps independent repository and settings redo indexes
    Then scoped redo survives startup history retention and reload

  Scenario: Legacy repository redo remains available through settings changes and repeated migration
    Then scoped legacy redo materializes every future without touching settings
  @history-performance
  Scenario: Scoped file history validates positions without building another repository snapshot
    Then scoped file history performs one snapshot scan per undo and redo
  @history-performance
  Scenario: A failed immutable application entry read can be retried without moving files
    Then an uncached history entry failure leaves files unchanged and retries successfully

  @local-git
  Scenario: Pending Git conflicts retain Abort through private history compaction
    Then private retention preserves pending Git operation checkpoints

  Scenario: Retired file overrides stay discarded when saved settings history is replayed
    Then legacy file settings cannot return through history reload undo or redo
