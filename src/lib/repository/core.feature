# Copyright (C) 2026 Erik Landvall
# SPDX-License-Identifier: AGPL-3.0-only
# See LICENSE and LICENSE-ADDITIONAL-TERMS.
@repository-core
Feature: Git-backed repository editing
  @repository-lifecycle
  Scenario: Renaming a repository preserves its files, Git history and saved redo
    Then repository rename changes only its name and rejects invalid or stale requests
  @history-messages
  Scenario: A grouped message describes the complete edit and formatting has its own label
    Then private history subjects summarize grouped changes and explicit formatting durably
  @edit-grouping
  Scenario: Continuous row edits amend only the latest private revision
    Then grouped repository writes persist each edit and undo the entire row session
  @edit-grouping
  Scenario Outline: Only a validated uninterrupted row session can amend
    Then repository edit grouping ends on "<boundary>"
    Examples:
      | boundary        |
      | another group   |
      | another row     |
      | another file    |
      | multiline edit  |
      | ungrouped edit  |
  @edit-grouping
  Scenario: Editing after grouped undo preserves the abandoned future
    Then grouped repository edits never amend a restored history entry
  @edit-grouping
  Scenario Outline: Interrupted group amendments recover without duplicate undo steps
    Then a grouped repository amendment recovers at "<stage>"
    Examples:
      | stage         |
      | prepared      |
      | files-flushed |
      | refs-flushed  |
      | finalized     |

  @source-scopes
  Scenario: Every source version keeps its own change graph across commits checkouts and reload
    Then change graphs remain isolated by source version without changing checkout content
  @source-scopes
  Scenario: Returning to a version retains divergent edit futures and same-commit branch choices
    Then scoped change graphs retain divergent futures and share identical source commits
  @source-scopes @graph-ancestry
  Scenario: Scoped graph edges bridge hidden checkouts and retain shared baselines and separate roots
    Then scoped graph ancestry reconnects hidden checkouts and preserves actual Git parents
  @source-scopes
  Scenario: Legacy private history migrates without losing revisions or undo state
    Then legacy change graphs migrate durably while keeping global history endpoints
  @source-scopes
  Scenario Outline: Source graph boundaries recover exactly once with repository journals
    Then a scoped source "<operation>" recovers at "<stage>"
    Examples:
      | operation | stage         |
      | commit    | prepared      |
      | commit    | files-flushed |
      | commit    | refs-flushed  |
      | commit    | finalized     |
      | checkout  | prepared      |
      | checkout  | files-flushed |
      | checkout  | refs-flushed  |
      | checkout  | finalized     |
  Scenario: Every change has a Git revision while ordinary source history stays explicit
    Then repository edits have isolated Git snapshots and explicit source commits
  Scenario: Undo and redo persist across reopening and across files
    Then repository navigation restores files and survives reopening
  Scenario: Editing after undo retains the abandoned future
    Then divergent editing retains its previous Git future
  Scenario: History snapshots expose real Git parents across retained divergent changes
    Then repository history exposes its actual Git ancestry after divergence and reopening
  @select-history
  Scenario: Selecting a retained change restores its files as one reversible history action
    Then retained revisions can be selected undone and redone without changing source Git
  @select-history
  Scenario: Invalid or unrelated revision selections cannot change a repository
    Then invalid history selections leave files Git and metadata untouched
  @checkout-commit
  Scenario: Source commit checkout detaches HEAD and preserves local files and branch history
    Then source commits can be checked out and returned to a branch without moving branch refs
  @checkout-commit
  Scenario: Source checkout rejects commits outside retained ordinary history
    Then invalid source commit targets cannot mutate repository state
  @checkout-commit
  Scenario: Detached version graphs retain branches remote refs and annotated tag history
    Then source version graphs retain every referenced commit while detached
  @change-lines
  Scenario: Changed line ranges follow real Git parents across divergence and reopening
    Then private Git history reports changed lines without modifying source commits
  @change-lines
  Scenario: File additions and removals report text lines without inventing binary line numbers
    Then private history distinguishes text file changes from binary files
  @change-lines
  Scenario: Immutable change summaries skip unchanged trees and retry failed Git reads
    Then private history caches line summaries without masking Git read failures
  Scenario: Renaming and deleting preserve binary file bytes through undo
    Then file operations restore exact binary contents
  @add-files
  Scenario: Adding a file batch preserves binary bytes and source Git through one undoable revision
    Then added file batches preserve bytes and source Git through undo and redo
  @add-files
  Scenario Outline: Invalid file batches leave every file and both Git stores unchanged
    Then an added file batch with "<conflict>" is rejected before writing
    Examples:
      | conflict |
      | existing file |
      | existing folder |
      | existing ancestor file |
      | duplicate paths |
      | batch ancestor file |
      | batch descendant file |
      | absolute path |
      | parent traversal |
      | empty segment |
      | backslash |
      | control character |
      | source Git metadata |
      | nested Git metadata |
      | invalid bytes |
      | empty batch |
  @add-files
  Scenario: Concurrent file batches reject stale requests and exact retries add no revision
    Then added file batches enforce revisions and exact retries
  @add-files
  Scenario: Adding files after undo retains the abandoned editor future
    Then added file batches retain divergent editor history
  @add-files
  Scenario Outline: Interrupted file batches recover together exactly once
    Then an interrupted file batch at "<stage>" recovers exactly once
    Examples:
      | stage |
      | prepared |
      | files-flushed |
      | refs-flushed |
      | finalized |
  Scenario: Folder renames and deletion preserve complete subtrees through undo and redo
    Then folder operations restore exact subtree contents and modes
  Scenario: Folder destination collisions and missing sources leave both histories unchanged
    Then invalid folder operations and no-op renames preserve repository state
  Scenario: Stale folder mutations cannot overwrite a newer repository revision
    Then folder operations reject stale revisions without changing any files
  Scenario: No-op changes do not create artificial revisions
    Then no-op history commands preserve the revision
  Scenario: Stale concurrent changes are rejected without overwriting files
    Then concurrent repository changes reject stale revisions
  Scenario: Invalid file operations leave stored content unchanged
    Then invalid file operations cannot alter repository history
  Scenario: Imports preserve full ordinary Git history and refs
    Then imported Git repositories retain their ordinary history and refs
  @branches
  Scenario: Local branch choices include an unborn HEAD and imported branches without tags or remotes
    Then repository branch choices preserve their ordinary Git identities
  @branches
  Scenario: Creating a branch selects the current source commit without changing files, staging, or editor history
    Then creating a branch preserves working changes and both Git histories
  @branches
  Scenario: Branch checkout preserves binary modes and untracked files while editor undo changes only files
    Then switching branches records reversible working snapshots independently of source refs
  @branches
  Scenario: Invalid, duplicate, conflicting, and unborn branch requests leave the repository unchanged
    Then invalid branch operations preserve repository state
  @branches
  Scenario: Stale branch requests fail and exact completed retries remain idempotent
    Then branch requests enforce revisions and exact retries
  @branches
  @auto-stash
  Scenario Outline: Branch and commit checkout automatically stash tracked and staged changes
    Then branch checkout automatically restores "<change>" without altering source commits
    Examples:
      | change |
      | working text |
      | working mode |
      | tracked deletion |
      | staged text |
      | staged mode |
      | staged addition |
      | staged deletion |
  @branches
  @auto-stash
  Scenario Outline: Branch and commit checkout stash colliding untracked and ignored files
    Then branch checkout automatically restores a "<collision>" collision
    Examples:
      | collision |
      | same path |
      | parent file |
      | child file |
      | ignored path |
  @auto-stash
  Scenario: Automatic checkout stashes preserve independent working and staged versions in both directions
    Then automatic checkout stashes preserve partial staging binary files modes and same-commit branches
  @auto-stash
  Scenario: A detached commit with saved edits remains reachable without a branch
    Then a detached automatic-stash base remains visible and restores its edits
  @auto-stash
  Scenario Outline: Missing automatic-stash objects cannot change working files or Git
    Then an automatic stash with a missing "<snapshot>" leaves checkout untouched
    Examples:
      | snapshot |
      | working  |
      | index    |
  @auto-stash
  Scenario: A failed durability flush cannot discard the outgoing automatic stash
    Then an automatic stash flush failure preserves the current checkout for retry
  @auto-stash
  Scenario Outline: Automatic stash departure and restoration recover once at each journal boundary
    Then an automatic stash "<operation>" recovers at "<stage>"
    Examples:
      | operation | stage         |
      | departure | prepared      |
      | departure | files-flushed |
      | departure | refs-flushed  |
      | departure | finalized     |
      | return    | prepared      |
      | return    | files-flushed |
      | return    | refs-flushed  |
      | return    | finalized     |
  @branches
  Scenario Outline: Branch creation and checkout recover once at every journal boundary
    Then an interrupted branch "<operation>" at "<stage>" recovers exactly once
    Examples:
      | operation | stage |
      | create | prepared |
      | create | files-flushed |
      | create | refs-flushed |
      | create | finalized |
      | switch | prepared |
      | switch | files-flushed |
      | switch | refs-flushed |
      | switch | finalized |
      | commit | prepared |
      | commit | files-flushed |
      | commit | refs-flushed |
      | commit | finalized |
      | return | prepared |
      | return | files-flushed |
      | return | refs-flushed |
      | return | finalized |
  @branches
  Scenario Outline: Branch recovery rejects externally changed source refs before restoring files
    Then pending branch recovery rejects "<change>" at "<stage>"
    Examples:
      | change | stage |
      | symbolic HEAD | prepared |
      | source ref | files-flushed |
      | target ref | prepared |
      | removed target | refs-flushed |
      | missing target object | prepared |
  @branches
  Scenario: Checkout after undo preserves an abandoned editor future
    Then branch checkout retains divergent editor history
  Scenario Outline: Incomplete or unsafe imports fail visibly
    Then repository import rejects "<kind>"
    Examples:
      | kind |
      | invalid name |
      | duplicate files |
      | file blocks directory |
      | missing Git HEAD |
      | shallow Git |
      | linked Git |
      | alternate Git objects |
      | symbolic link tree |
      | submodule tree |
  Scenario Outline: A journaled write recovers and retries without duplication
    Then an interrupted "write" at "<stage>" recovers exactly once
    Examples:
      | stage |
      | prepared |
      | files-flushed |
      | refs-flushed |
      | finalized |
  Scenario Outline: Explicit commits recover without duplication
    Then an interrupted "commit" at "<stage>" recovers exactly once
    Examples:
      | stage |
      | prepared |
      | files-flushed |
      | refs-flushed |
      | finalized |
  Scenario: An interrupted import remains discoverable for recovery
    Then a pending repository creation can be reopened
  Scenario: Recovery refuses a newer metadata revision
    Then recovery rejects a conflicting metadata journal
  Scenario: Recovery refuses a newer ordinary source commit
    Then recovery rejects a conflicting source head
  Scenario: A storage failure before journaling leaves the last revision usable
    Then failed storage preparation can be retried safely
  Scenario: Filesystem access errors remain visible and initialization can retry
    Then repository filesystem failures are surfaced without fallback storage
  Scenario: Unsupported symlinks remain untouched
    Then externally introduced links are rejected without being followed
  Scenario: Deleted tracked files disappear from explicit commits
    Then source commits preserve ignores and tracked deletions
  Scenario: Empty and malformed explicit commits are rejected
    Then invalid source commits leave both histories intact
  Scenario: Detached source heads remain detached during editing and explicit commit
    Then detached repositories commit without inventing a branch
  Scenario: Repository preferences remain outside Git history
    Then repository preferences persist independently of working files
  Scenario: Executable modes and missing tracked files survive a complete import
    Then repository import preserves executable modes and working deletions
  Scenario: An unborn ordinary Git repository can be imported
    Then an unborn Git directory imports without fabricated source commits
  Scenario: Default browser namespaces remain isolated by the filesystem adapter
    Then the default repository paths work inside an isolated filesystem
  Scenario: Circular Git refs fail instead of inventing an empty source history
    Then circular source references are surfaced
  Scenario Outline: Malformed import payloads are rejected before publication
    Then malformed import payload "<kind>" is rejected
    Examples:
      | kind |
      | invalid bytes |
      | invalid HEAD |
      | missing detached object |
      | invalid index |

  Scenario: Committed file baselines read immutable source blobs without editing state
    Then committed file baselines ignore working edits and preserve repository state
  @history-performance
  Scenario: Warm undo and redo touch only changed file contents and reuse immutable graphs
    Then history navigation avoids unchanged file IO and repeated graph reads
  @history-performance
  Scenario Outline: A partially applied history patch recovers file and directory replacements
    Then an incremental "<direction>" patch recovers after writing its first target file
    Examples:
      | direction |
      | undo      |
      | redo      |
  @history-performance
  Scenario: Reading a file avoids unrelated contents and refuses symbolic link traversal
    Then a direct repository read touches only its requested file and rejects linked ancestors
  @history-performance
  Scenario: An unavailable target blob prevents every working-file mutation until recovery
    Then an incremental restore validates all target blobs before writing any files

  @local-git
  Scenario: Local staging commits the index while preserving later working edits
    Then local Git stages commits and preserves unstaged changes

  @local-git
  Scenario: Local merge conflicts survive reopening and can be resolved or aborted
    Then local Git merges resolve conflicts and abort without losing changes

  @local-git
  Scenario: Local rebase squash cherry-pick and revert preserve repository history
    Then local Git rewrites and replays source commits safely

  @local-git
  Scenario: Local stashes preserve staged unstaged and untracked files
    Then local Git stashes restore the staging split and protect untracked files

  @local-git
  Scenario Outline: Local Git publication recovers after every journal boundary
    Then local Git publication recovers at "<stage>"
    Examples:
      | stage         |
      | prepared      |
      | files-flushed |
      | refs-flushed  |
      | finalized     |

  @local-git
  Scenario: Local fast-forward squash merge tags and branch maintenance work together
    Then local Git supports fast-forward squash merge and reference maintenance

  @local-git
  Scenario: Local reset modes preserve their documented working and staged states
    Then local Git soft mixed and hard resets preserve the appropriate states

  @local-git
  Scenario: Local rebase conflicts support continue skip and abort after reload
    Then local Git rebase conflicts survive reload and support every exit

  @local-git
  Scenario: Local stash collisions preserve both the stash and current files
    Then local Git refuses destructive stash application and retains recovery data

  @local-git
  Scenario: Stashing untracked files preserves ignored files
    Then local Git stashes leave ignored files and binary resolutions intact

  @local-git
  Scenario: Annotated tags and packed objects work in local Git operations
    Then local Git resolves annotated tags and restores stashes from packed repositories

  @local-git
  Scenario: Binary merge conflicts preserve exact blobs when choosing a version
    Then local Git binary conflicts preserve incoming and current bytes

  @local-git
  Scenario: Renaming the active branch preserves its configuration and staging
    Then local Git branch renames preserve upstream configuration and staged files

  @local-git
  Scenario: Imported unfinished Git operations cannot be silently committed with wrong parents
    Then local Git refuses foreign operation metadata without changing its index or refs
