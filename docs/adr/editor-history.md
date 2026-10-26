# Git-backed application history

> [!IMPORTANT]
> Record edits and deliberate workspace actions in durable private Git history while keeping normal repository commits independent.

## Context

The developer selected the Operations workflow history model for undo/redo:
durable Git revisions, navigation through those revisions, and preservation of
the abandoned future when editing after undo. A code repository also has an
existing, user-managed Git history. Moving its normal branch for each keystroke
would mix these distinct responsibilities and rewrite imported history.
Workspace actions were initially included in undo/redo. The developer later
found replaying tab and viewport navigation distracting and requested file-only
repository histories, plus independent histories for each settings scope.
The developer subsequently requested grouping continuous same-row edits in both
the History graph and Undo/Redo, rather than presenting one step per character.

## Decision

Use a private history Git directory outside the working repository's `.git/`.
It saves every accepted CodeMirror document transaction and file creation,
rename, or deletion immediately. Continuous ordinary typing and deletion on one
row form one logical revision and Undo/Redo step. A 1.5-second pause, explicit
cursor/selection move, row/file or view change, blur, paste, formatting, or
history navigation ends the group. Replacing a selection, multiple cursors and
multiline changes remain separate operations. Do not debounce accepted saves.

For a continuing group, create a new immutable private snapshot parented to the
group's starting revision, replacing the previous intermediate endpoint in the
graph and undo indexes. The application timeline amends its corresponding entry
with the same original before-state and newest after-state. Application ordering
issues the repository's group token, validates both endpoints, and prevents
amendment across other actions or scoped Undo/Redo. Both existing journals retain
the exact command and group identity for idempotent recovery. Superseded objects
become collectable after publication; prior logical steps and divergent futures
remain reachable. Normal source commits and staging are never amended.

Automatic history subjects briefly describe observable changes from the logical
revision's parent: declarations, values, identifiers and other recognizable code
changes, with a concise fallback when no specific description is supported.
Keep them to one line of at most 72 characters, without string contents or
invented intent. Formatting carries an explicit whole-document action through
the repository command and journals, producing `Format document`; layout changes
alone do not identify a formatter action. The application entry uses the same
persisted subject. Existing historical messages remain unchanged.

A separate private application Git timeline records before/after workspace and
settings snapshots, plus the exact private repository revision endpoints for
file mutations. Opening, closing and selecting tabs, switching repositories or
views, expanding/collapsing folders, and changing settings share that timeline.
Workspace-only actions do not create repository file snapshots or source commits.
Cursor movement, text selection, focus and scrolling remain passive restoration
context, captured at action boundaries without producing extra undo steps.

Opening and closing editable split panes are workspace actions in that same timeline. Each additional pane has a stable identity and its own file, selection and scroll position; splitting a pane inserts another immediately to its right. Legacy single-split workspaces migrate when normalized.
Pane files and their independent positions live in workspace metadata. All
views share repository files and the transaction queue; reflecting an edit into
another view is an external update, not another Git revision. File moves carry
each pane's paths and positions; deleting a file closes its panes.

History is an independent right-hand Sheet pane rather than a replacement for
the editor viewport. History, Git and AI share the dock in that order, keeping
AI furthest right. Pane visibility and preferred width are workspace metadata;
graph choice and scroll remain per repository. Older History-page snapshots
restore as Editor with History open. Compact layouts use the shared Sheet or
stack multiple open panes when horizontal space cannot preserve the editor.

Undo and redo in the editor navigate only file changes in the active repository.
Global defaults, each repository's settings, and each file's settings have
independent undo/redo indexes. They persist in the application journal alongside
the existing Git entries, with lazy indexing of older entries. Tab, repository,
page and pane navigation remains durable restoration metadata, but is not an
undo step. Applying a scoped revision preserves the live navigation and unrelated
settings. Settings restoration never moves a repository's file-history cursor.

A new change replaces only its own scope's redo path, retaining abandoned futures
in private Git refs. Navigating or editing another scope preserves redo elsewhere.
The existing cross-tab lock, revision validation, crash journal and startup
retention remapping cover every scope. Ordinary source branches, commits and
staging remain independent. Legacy unscoped API calls remain available for
compatibility; the interface always supplies an explicit scope.

Selecting a `Staged changes` graph entry explicitly restores that private repository
revision and records the navigation as an application action. Undo returns to
the prior file cursor without changing the current workspace view; retained futures remain available to select.
The operation validates membership in the active source commit's retained history and
uses the same locking and journal contract as other file restores. It changes
working files without changing source branches, staging or commits.

Each ordinary source commit owns a persistent `Staged changes` graph, identified by its
Git object ID rather than a branch name. Repositories without a source commit
have their own initial scope. Creating a source commit or first checking out a
different commit opens an empty graph; returning to an existing commit restores
its recorded changes and divergent futures. Import/setup and checkout snapshots
are hidden baselines, not edits in the graph. Existing unscoped history is kept
under the source HEAD present at migration because older source associations
cannot be reconstructed reliably.

Graph scope does not reset the repository-wide private cursor or application
undo timeline. Leaving a source commit automatically stashes its working files
and staging index in private Git snapshots keyed by that source OID. Returning
restores that state, including partially staged files, rather than requiring a
commit or manual stash. Without an automatic stash, checkout restores committed
files. Its saved graph can have no selected row until an edit is restored or
made. Private Git parent identities remain unchanged. Graph connections follow omitted snapshots to the
nearest visible ancestors within the scope, preserving continuity without
displaying hidden checkout rows or connecting unrelated histories. Ordering uses
that visible ancestry as well, so equal or skewed timestamps cannot reverse it.
When multiple paths share only their hidden starting state, a small nonselectable
junction joins them. It is not an edit and does not appear in an empty graph.

Normal repository commits remain an explicit user operation with a message and
author identity. A commit establishes source history independently of editing
history and starts its own empty `Staged changes` graph; undoing a prior edit afterward
can make the working tree dirty again without rewinding source HEAD.

Branch creation and switching are explicit source-Git operations. Creation starts
at an existing ordinary commit, selects the new branch, and preserves working
changes and staging. It never manufactures an initial commit. Switching
automatically preserves tracked files and staging. Noncolliding untracked and
ignored files stay available; colliding files are saved with their outgoing
commit and restored on return. Branches at the same source commit share the
working state without clearing staging. Journal automatic-stash metadata,
working files, source index, and symbolic HEAD together. Changed working files
receive a private history snapshot; undoing that
snapshot restores files while leaving the selected source branch unchanged.

Selecting a `Commit history` entry opens inspection without changing files or
HEAD. Its explicit checkout action checks out that source commit with a
detached HEAD. It uses the same automatic stashing, collision preservation and
journal as branch switching, without moving any branch ref. The sidebar shows
the detached commit and still offers branches to return to. Source graphs include
HEAD and existing branch, remote and tag histories so later referenced commits
remain reachable after checking out an earlier version. A detached commit can be
preserved by creating a branch before leaving it. Selecting the current commit
does nothing. Private undo restores the checkout's previous working files but
leaves source HEAD and staging at the checked-out commit, just as for a branch
switch.

Automatic stashes use private editor objects and do not create source commits or
modify the user's manual Git stash stack. Saving the outgoing state and consuming
the incoming stash share checkout's existing journal, cross-tab lock, revision
checks and recovery boundaries. Retention keeps and remaps both working and
staged snapshots. Source graphs include automatic-stash bases so their saved work
remains reachable while detached. Active merge/conflict operations must still be
completed or aborted before switching source versions.

The worker serializes accepted operations and checks an opaque expected revision
under a cross-tab lock. Journal an operation before applying its working-tree
changes, flush filesystem writes, and finalize metadata last. Recovery replays a
pending operation rather than replacing stored data with an empty repository.
Errors and pending writes remain visible. Never report persistence before the
worker confirms it.

History navigation reads the authoritative repository cursor without constructing
a complete public snapshot for preflight. Its pending journal retains both
immutable tree endpoints; restoration compares Git identities and applies only
changed files and modes. Target data is read before mutation, and replay remains
idempotent after a partial patch, including file/directory replacement. Older
journals keep their full-tree recovery path. Immutable graph and entry caches
reduce repeated reads without replacing metadata revision checks, filesystem
flushes or the journal's publication boundaries.

The application timeline has its own cross-tab lock and pending journal. Record
the intended action before invoking a repository mutation, retain the exact
idempotent command, and finalize application state and preferences only after
Git objects and refs are flushed. Recovery completes the same action. A stale
application cursor must fail rather than replace another tab's work. Existing
per-repository histories remain usable: after newer global actions are exhausted,
older edits can be adapted into reversible application entries using current
workspace context instead of inventing past interface state.

## Consequences

CodeMirror's built-in history is not a second authority. Toolbar commands,
keyboard shortcuts, and native browser history input route to the selected
application-history scope. File undo crosses files within the selected repository
while preserving live tabs, panes and navigation; missing paths are reconciled.
Settings undo replaces only the selected settings scope. Legacy unscoped API
calls retain their original cross-repository workspace replay contract.

Private history uses additional storage, especially for binary changes. Git
objects deduplicate content, but loose objects are not automatically a compact
archive. Startup compacts only the private histories using a per-file edit budget,
300 by default and configurable from 0 through 10,000 with personal defaults and
repository overrides. The budget is total across a file's divergent paths. Zero
retains branch endpoint states without intermediate edits. Current cursors, redo
endpoints, forks and source-version scope baselines remain structural checkpoints.
Multi-file operations remain atomic when any affected file requires their state.
These checkpoints are additional to the per-file edit budget.

Compaction rewrites private parent links and application revision endpoints
together; it does not modify source commits, source refs, staging or working files.
The discarded common prefix becomes a baseline snapshot. Subsequent discarded
steps are folded into their next retained snapshot, preserving all branch ends.
New immutable Git objects are flushed before a single metadata transaction
publishes both private timelines and rotates their concurrency tokens. Ref repair
and collection follow publication and are repeatable after interruption. No
obsolete objects are deleted before publication. Normal editing continues to
persist every transaction while grouping adjacent row edits; retention budgets
logical revisions during startup. Browser storage remains subject to quota and
eviction.

## Status

Adopted for the repository editor and extended to application-wide actions.
Source and real-browser scenarios own evidence for isolation, persistence,
navigation, and recovery.


## Local source-Git operation sessions

The developer requested local Git management from both History views and a
reviewed commit entry point from the editor. One shared review surface owns
staging, diffs, message/identity and explicit commit. Source index contents are
the commit snapshot; later unstaged edits remain independent. Existing private
edit graphs retain their recovery role and do not become ordinary source commits.

Prepare mutable Git operations in an isolated checkout sharing only immutable
ordinary objects. Publish index/control-file changes through the existing
repository recovery journal, alongside private working snapshots and application
history. A library merge/cherry-pick primitive must not mutate the live checkout
outside that publication boundary. Conflicts and multi-step replays have durable
operation metadata, explicit resolution, Continue/Skip/Abort and original-state
checkpoints. Validate stale controls before restoring working files in recovery.

Merge, linear rebase, squash, amend/reword, cherry-pick, revert, reset, tags,
branch maintenance and stash are local browser operations. Rebase preserves
original authors and creates new committers; merge preserves the actual parent
commits. Reject unsupported merge topology rather than silently flattening it.
Source rewrites retain recovery refs independently of private edit retention.
Neither file Undo nor settings Undo rewinds source refs. Remote transport and
external automation remain outside these actions.
