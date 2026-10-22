# Browser repositories

Remote Git extends this same engine through `remote-git.ts` and the scoped HTTP
adapter in `../remotes/git-http.ts`. Clone validates full history before
publication. Fetch/push plan control-file changes in scratch directories sharing
immutable objects, then publish through the existing journal. Credentials and
network commands never enter that journal or application Undo/Redo commands;
recovery cannot resend upstream writes. Pull and remote branch checkout reuse
local integration and file-history semantics. See the
[upstream guide](../remotes/README.md) for Settings, supported workflows and CORS.

`client.ts` is the UI boundary. Its dedicated inline worker owns the browser
service, so Git and filesystem work do not run on the rendering thread.
`core.ts` is the same engine used by source tests with an injected filesystem,
metadata store, durability flush and serialized lock. `browser.ts` supplies
LightningFS (`v1/repositories`), IndexedDB metadata
(`v1/repositories/index`) and Web Locks. Missing locks fail explicitly.
`application-history.ts` orders deliberate workspace actions and repository
changes in one durable application timeline. Its private Git directory is
`/history/application.git`; it does not put workspace state or settings into an
ordinary source repository or its per-repository file snapshots.
`worker-runtime.ts` must remain the worker's first import: LightningFS's text
encoding dependency recognizes a Node-style `global` but not a worker's `self`.
The adapter aliases `globalThis` without adding a window or replacing native
encoding APIs. Browser scenarios exercise startup through the real inline worker.

Each repository has authoritative working files and ordinary Git metadata under
`/repositories/<id>`. Its independent editor history Git directory is
`/history/<id>`, outside the source repository. Editing, file operations and
Undo/Redo never modify source Git refs or its staging index. The service's explicit
`commit` operation records all nonignored working files and tracked changes in the
ordinary repository; it preserves existing imported history and author input.

Snapshots also expose sorted local `branches`, including the symbolic branch of
an unborn repository. `createBranch` creates and selects an ordinary local branch
at the existing source HEAD; it requires an explicit first source commit and
preserves working files, staging, and editor history. `switchBranch` selects an
existing local branch, automatically stashing the outgoing source commit's
working files and index when they differ from its committed tree. Returning to
that commit restores both, including partial staging, binary bytes and executable
modes. Noncolliding untracked and ignored files remain available while visiting
other versions; colliding paths stay in the outgoing stash until it is restored.
Both operations validate names and expected revisions under the repository lock.

`checkoutCommit(id, oid, expectedRevision)` checks out a commit reachable from
source HEAD, an existing source ref or an automatic-stash base, with a detached HEAD and unchanged branch
refs. It shares branch checkout's automatic stashing, binary/mode preservation
and recovery journal. Selecting the current source HEAD
is a no-op, including when local changes exist. Switching between branches at
that same commit preserves files and staging without a stash round trip.
Version snapshots include HEAD, automatic-stash bases and existing source refs,
so saved work and branch tips remain reachable while detached;
`switchBranch` returns to a branch. A detached commit should receive a branch
before leaving it if it needs a durable source ref.

A checkout that changes working files adds one private history snapshot, keeping
Undo/Redo and abandoned futures intact. Undo restores files without switching the
ordinary branch or resetting its index. Source refs and commit objects remain
unchanged except for an explicitly created branch; checkout updates symbolic or
detached HEAD and restores the saved index or the selected source commit's tree.
Checkout journals retain
the prior HEAD form and OID plus the target ref/OID. Recovery validates those
source identities and target objects before restoring files, then replays files,
index and refs idempotently. Conflicting external source changes fail visibly.
Automatic stashes are private editor working/index snapshots keyed by source
commit OID, shared by branches at that commit. They survive reload and history
retention without adding source commits or entries to the user's manual Git
stash list. The repository journal publishes the outgoing stash, incoming
restoration, index and HEAD as one recoverable operation. Restored stashes are
consumed, and leaving the commit saves its latest state again.

Rename and delete accept a file or a folder inferred from its descendant paths.
A folder operation changes the entire subtree in one private Git revision,
preserving binary bytes and executable modes; Undo/Redo restores it together.
Renames reject occupied destinations, parent-file collisions and moves into the
same folder's descendants before changing working files. Empty directories are
not versioned, matching Git's file-based trees.

`addFiles` adds a nonempty batch of new binary or text files to an existing
repository, using repository-relative paths already prefixed with the chosen
destination folder. It rejects unsafe paths, all `.git` paths, duplicate paths,
and file/folder collisions across the batch and existing files before writing.
Existing folders may receive new descendants; existing files are never replaced.
The entire batch creates one private revision and uses the same durable journal,
revision checks and exact-retry handling as edits. Undo/Redo restores the batch
together without changing ordinary Git history or staging.

Every completed document transaction durably saves an immutable private Git
snapshot. `edit-grouping.ts` supplies a short-lived token for continuous typing
and deletion on one row; a 1.5-second pause or interaction boundary ends it.
The engine validates the actual changed row before amending. A continuing group
replaces its intermediate endpoint in the graph and undo stack, parenting the
new snapshot to the group's original before-state. Application history replaces
its matching entry atomically through its journal, preserving the initial
session and latest result. Other actions, scoped history navigation, paste,
formatting, multiline changes and file changes cannot extend an earlier group.
Low-level writes without a group remain independent steps.

`edit-message.ts` derives one short subject from the actual parent-to-result
change: named declarations, identifier/value replacements, calls, conditions,
comments or a compact line-count fallback. Subjects are limited to 72 characters,
escape Markdown markup and omit string contents. Group amendments compare with
the group's original Git parent, so the final subject describes the entire edit.
An engine-local cache of eight immutable before-texts avoids rereading that blob
on each keystroke; read failures remain visible and retryable.
The optional `write` action argument identifies whole-document formatting as
`Format document`. It is kept in the exact journaled command and always ends an
edit group. Unchanged formatting creates no revision. Application-history labels
use the same persisted subject, including recovery and Undo/Redo. Older revisions
retain their original messages.

The private current ref, redo ref, and preserved future refs keep logical versions
reachable. Replaced intermediate objects are collected during startup; prior
logical steps stay intact. Undo moves the private cursor and working files; an edit after Undo
archives the abandoned future. Source commits remain independent. `revision`
is an opaque concurrency token; `historyHead` is the stable private Git identity
used to validate application undo even after an ordinary source commit.
Both `history` and ordinary source `commits` expose each commit's actual Git
`parents`, ordered child-before-parent. Each source commit owns a durable Change
Graph in repository metadata, keyed by its OID; a separate `unborn` scope covers
editing before the first source commit. Source commits and first-time checkouts
start with an empty graph. Returning to that source commit restores its previous
graph, including abandoned edit futures; branches pointing to the same source
commit share it. Checkout restores an automatic stash when present, otherwise
the source files.

Setup/import baselines and checkout navigation snapshots remain real private Git
objects but are hidden from the graph. `history` contains only the active scope's
visible revisions, while `historyHead` and undo/redo stacks retain their existing
global meaning for application history. A hidden current endpoint has no selected
graph row. Parent OIDs stay truthful even when the parent belongs to another scope
or a hidden baseline. Private versions also expose `graphParents`: their nearest
visible ancestors or known scope baseline reached through omitted snapshots.
These projected edges order and connect graph rows. Sibling edit paths that share
a hidden baseline can meet at a nonselectable junction; truly separate Git roots
remain separate. Projection walks Git ancestry iteratively, stops at the scope's
baseline, caches immutable parents, and never rewrites stored objects or scope
membership. Ordinary source versions have no projected parents.
Only visible scope commits receive line summaries; an empty graph reads no private
commits. Membership is journaled together with edits, commits and checkouts.

Older metadata has no reliable source attribution for its existing edits. Lazy
migration retains those reachable edits under the current source HEAD, excludes
setup/checkout rows, and preserves every private object and navigation stack.
Metadata-only migration is atomic under the repository lock and survives reload.
Private history versions also expose `changes`: paths with inclusive, one-based
`before` and `after` line ranges compared with the actual first parent. Insertions
have only new ranges; deletions have only old ranges. The parentless import has
no change summary, and ordinary source versions do not carry these summaries.
Binary or non-UTF-8 files are identified without invented line numbers. Git tree
comparison prunes identical subtrees and blobs; immutable summaries are cached
by commit identity for the engine lifetime and reconstructed from Git after
reload. Snapshot callers receive copies, and object-read failures propagate
instead of being mislabeled as binary data.

`selectHistory(id, oid, expectedRevision)` restores an existing private revision
as one undoable action, without creating another file snapshot or changing source
Git refs, commits or staging. It accepts only visible revisions in the current
source version's `Staged changes` graph, validates target trees before journaling,
and keeps the previous cursor and redo tips reachable. The ordinary repository
undo/redo stacks record the jump, so application undo returns to the exact state
before selection and redo selects it again. Selecting the current revision is a
no-op. The application timeline records this operation alongside other deliberate
actions and uses the existing durable recovery and exact-retry checks.

Application entries contain before/after workspace and settings snapshots plus
the exact private repository Git endpoints for file changes. Tabs, repository
and view selection, folder expansion and settings actions create application
entries without touching either repository Git history. Passive cursor and
scroll observations remain the workspace cache's responsibility. Scoped undo restores only file state for the selected repository or only the
selected Global, Repository, or File settings scope. Live navigation remains in
place. Separate durable indexes keep undo/redo paths independent; navigation and
changes in other scopes do not discard redo. Older entries are indexed lazily. Branch-checkout entries retain the existing content-only undo contract:
they do not rewind ordinary source HEAD or its staging index.

The application cursor, per-scope undo/redo indexes and pending journal use the metadata
database's version-2 `application` store. A separate application Web Lock orders
all timeline calls across tabs. Its pending record is durable before a repository
mutation begins and retains the exact idempotent repository command. Recovery
completes that command, writes the immutable application Git entry and refs,
then atomically updates the application cursor and preferences and removes the
journal. A stale global cursor fails instead of overwriting another tab's state.
Abandoned futures and synthetic migration entries retain explicit Git refs.
`ActivityRejectedError` identifies correctable input/domain validation only after
the repository revision is verified unchanged and its application journal is
discarded successfully. Storage, concurrency and recovery errors retain their
failure identity. Identical workspace states and unchanged repository commands
do not create artificial entries or clear the redo future.

Existing per-repository histories are kept intact during upgrade. Once the selected
repository undo index is exhausted, `undoActivity` can receive the selected legacy
repository and current UI snapshot. It journals an old repository undo and
creates a reversible application entry without inventing historical UI state.
Explicit stacks support repeated migration undo/redo without rewriting old Git
ancestry. Initial application metadata also allows pre-upgrade repository redo.
`redoActivity` can materialize those existing future edits into application
entries, retaining the allowance across reload and history navigation. The legacy unscoped API retains its `legacyRedoAllowed` contract. Scoped
repository histories track that allowance independently, so settings and
navigation cannot discard a repository future. A new edit clears only its
repository scope's fallback allowance. This prevents a discarded repository future from reappearing through a
migration fallback. The optional `activityCheckpoint` adapter hook and source scenarios
exercise interruptions before/after repository work, application object/ref
flushes and finalization.

Before working files or refs change, snapshot objects are flushed and a pending
operation is stored. Files/index and refs are flushed before the metadata update
and journal removal complete atomically. `open` and mutations recover pending
operations; `read` reports pending recovery rather than mutating during a read.
Exact retries are idempotent; a stale competing edit fails with its buffer intact.
No failed operation wipes or resets browser storage. The browser adapter's
optional checkpoint callback supports failure injection in integration tests.

History navigation validates the private cursor through `position`, which recovers
the repository journal and reads authoritative metadata without building a second
public snapshot. Its journal stores both immutable file-tree endpoints. Restoration
prunes identical Git subtrees and blobs, reads all changed target blobs before
writing, and applies only changed paths and modes. Replaying the same patch after
partial writes, deletions or file/directory replacements is idempotent. Older
journals without the previous endpoint retain the full-tree recovery path. All
existing flush, revision validation and metadata publication boundaries remain.

File listings inspect directory metadata without reading every file's bytes;
`read` checks the requested path and each ancestor for unsupported links, then
reads only that file. Graph views and application entries are cached by immutable
Git identities with bounded engine-local caches, copied at public boundaries and
evicted on read failure. Source ref identities and scoped graph membership remain
part of cache keys, so source changes, retention and reload never rely on a cached
cursor as authority. Every accepted document transaction still persists separately.

Imports preserve every supplied byte, including a complete supplied `.git`
directory. Without `.git`, a fresh ordinary repository is initialized. Binary
and non-UTF-8 files remain in snapshots and are explicitly read-only in the text
editor. `import.ts` recognizes a root `.git` pointer file without following it.
The directory-import UI asks the user to select the referenced Git directory;
the adapter replaces only the pointer with the supplied `.git/*` bytes. This
lets a submodule with complete, self-contained metadata become a standalone
browser repository. Nothing is published until the normal import validates its
index, refs, and history. Cancelling leaves existing repositories unchanged;
invalid metadata can be corrected with another selection.

Git directories that depend on `commondir`, shallow history, or alternate object
stores still fail explicitly. Nested repositories, gitlinks in imported history,
symlinks, unsafe paths and editing Git metadata remain unsupported. Errors name
the offending metadata path. Remote cloning, credentials, transport and proxies
are outside this service.

`readCommitted(id, path, oid)` reads a UTF-8 blob from an immutable source commit
without checking it out or touching working files/history. It returns null for an
unborn source repository or a path absent from the requested commit. Other read
failures remain errors. The editor uses this for Git line-change gutter baselines.

`history-retention.ts` compacts automatic history when the browser service first
loads application state. `historyLimit` counts recent mutations independently per
repository/file across all source-version graphs (default 300; 0–10,000). File
overrides follow personal and repository defaults. Current state, divergent tips,
redo tips, fork junctions and scope baselines are protected checkpoints. Multi-file
transactions are retained atomically when any path needs them. Prefix edits fold
into the baseline; other omitted edits fold into subsequent retained snapshots.
Normal source Git is excluded from rewriting and collection.

Startup first recovers application/repository journals, then holds the application
lock and all existing repository locks in sorted order. Replacement private Git
objects are flushed before publishing repository records and the remapped
application timeline in one IndexedDB transaction. Revision tokens rotate to
reject other tabs' stale cursors. References are repaired from authoritative
metadata, then only unreachable loose objects in the owned private stores are
collected. Ref repair and collection also run on unchanged plans, so interruption
after publication resumes safely. The planner never deletes or publishes state.


## Reviewed local Git operations

`local-git-types.ts` owns the worker request/status/diff shapes. `local-git.ts`
plans work in a separate checkout under `/git-operations/<id>/<request>/`.
Only immutable objects are shared with the ordinary object database. Index,
refs, reflogs and other control files stay in the scratch checkout until the
repository journal publishes a validated control-file patch and private working
snapshot. Scratch checkouts are removed in `finally`; an interruption may leave
an inert scratch directory but cannot publish its mutable index or refs.

`gitAction` checks the repository revision and uses the same idempotent journal
as editing. Its publication validates all changed control files before touching
working files, flushes working changes, then publishes control files and metadata.
Retry/recovery accepts only the recorded before/after bytes. Ordinary Git file
changes also get private edit snapshots and application-history transitions;
file Undo restores working files without reversing source refs or staging.

`gitStatus`, `gitDiff` and `gitCommit` supply the shared UI. The visible
`Staged changes` graph still represents private automatic edit history. Actual
Git staging lives in the review panel's Staging tab. The panel's commit action
uses the source index, supports partial content/hunks, and never automatically
includes later working edits. Fresh UI reviews initially stage all changes when
the index has no existing selection. Explicit exclusions and partial selections
remain intact for that review; opening another Git tab does not stage files.
The Staging diff icon opens a read-only HEAD-versus-index comparison in an editor
tab. Selecting a filename opens its working file in the editor, or its staged
comparison if the file was deleted. Working diff opens the inline hunk review.
Commit-file comparisons open immutable parent-versus-commit editor tabs keyed by
commit and path; opening them never checks out or changes a repository version.
Stage and unstage keep the working-file and graph collections, working-editor
revision and configuration intact. Only the index-facing revision changes;
staged comparison tabs still refresh against that revision. Native inert
containers temporarily block workspace input without reconfiguring every editor
or disabling each History node. The existing operation lock and durable journal
still serialize writes. Git status refreshes once after each operation, with a
fresh check whenever the pane reopens.
The older `commit` service method remains an
all-eligible-files compatibility operation for existing callers/fixtures; the
application commit flow uses `gitAction`.

Merges use the installed library on explicit trees with a binary-aware
`merge-driver.ts` wrapper around its existing pinned `diff3` dependency. Binary
conflicts preserve the real blobs in index stages and keep current working bytes
until the user chooses a version. The operation record
preserves the real parents, original control files, a private working checkpoint,
conflicting paths and binary-safe incoming/current versions. Continue records
the correct source parents; Abort restores the captured index, refs and files.
Rebase persists its remaining linear replay sequence and original author data;
Skip discards only the current replay result. Rebase of merge topology and
merges requiring multiple merge bases are rejected explicitly. Rewriting source
commits is deliberate and never part of automatic history retention.

Stashes use standard base/index/working commits, an optional third untracked
parent, `refs/stash` and its reflog. They work with packed objects. Including
untracked files excludes ignored paths. Apply/pop refuse tracked local changes
and untracked collisions; pop drops only after successful resolution. At the
original base, the captured staging split is restored; on a different base,
applied changes are left unstaged. Dropping a stash is an explicit confirmation.

Amend, squash, rebase, reset and branch deletion preserve source recovery refs
under `refs/editor/recovery/`. These are excluded from the ordinary graph but
available under Actions → Operation → Recovery. Source object collection remains out of scope. Unfinished operations imported
from another tool are rejected rather than guessed from incomplete metadata;
finish or abort those in the original checkout before importing it again.
Private retention remaps a pending operation's working checkpoint along with
its protected future endpoint, so reloading during a conflict keeps Abort valid.
