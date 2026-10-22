# Browser-local repositories

> [!IMPORTANT]
> Each imported or cloned directory of code is a repository in a browser filesystem backed by IndexedDB.

## Adopted model

Working files and `.git/` share one filesystem and repository boundary. Working
files are authoritative current content; Git objects and refs preserve history.
Application indexes, preferences, and editor state remain outside versioned
repository content and do not become a second editable copy of its files.

LightningFS and isomorphic-git implement the browser filesystem and Git engine,
following the Operations reference. A separate private Git directory records
editing history without touching ordinary source branches or commits. Metadata
tracks repository identity and history navigation; preferences remain outside
repository files. Imports retain supplied bytes and initialize ordinary Git only
when the input lacks a Git directory.

A submodule's `.git` file can point outside the uploaded working directory. The
browser cannot access that target through the first directory selection. Ask
the user to select the Git directory explicitly, then replace the pointer in
the imported copy with that complete metadata. Treat the result as a standalone
browser repository and validate its history before publication. Never follow a
pointer automatically or silently initialize fresh history when metadata is
missing. Shared-worktree metadata that still relies on `commondir`, shallow
history, alternate object stores and nested repositories remain unsupported.

“Repository” names a directory of code; avoid “project” as a second domain entity.
The private history store is not a second entry in the repository selector.

## Full-history cloning

GitHub clone must retain the complete history and repository refs needed for
branches and tags, with no shallow-depth or single-branch shortcut. A source
archive is not a Git clone. Acceptance must inspect reachable historical objects
and refs, not only compare the checked-out files. Remote changes still require
separate user intent; importing a repository does not authorize pushing it.

Use browser Git Smart HTTP over direct HTTPS where the host permits Git CORS,
or an explicitly selected trusted isomorphic-git compatible relay where it does
not. GitHub requires the relay mode. No public relay or editor backend is silently
introduced or provisioned. Provider APIs and tokens have separate, scoped direct
HTTPS connections; installing a JavaScript SDK does not bypass Git CORS. Keep
live infrastructure/permission verification distinct from local fixture tests.

## Integrity and recovery contract

Serialize mutations per repository and coordinate tabs. Use expected revisions
and explicit recovery for interrupted changes rather than accepting a new head
blindly. Read historical blobs without changing the working tree. Substantial
Git work belongs in dedicated workers; reads and diagnostics must not perform
hidden recovery mutations. Migration must copy and verify before retiring data.

## Origin and persistence

Workspace layout uses a small versioned localStorage snapshot, separate from
IndexedDB repository content and editor preferences. This allows synchronous
capture of the last selected repository/view, tabs, selections and scroll offsets
when the page closes. Layout updates never enter either Git history. Validate
saved paths and coordinates, ignore unavailable files, and surface storage
failures while allowing repository editing to continue.

A disposable appearance cache also supplies the loading screen's theme before
application code runs. IndexedDB settings remain authoritative. Keep the static
loading grid in the initial HTML, generated from its Svelte components. Its CSS
animations and responsive sizing must work before application JavaScript loads.
Attach live progress to the existing grid and keep it visible while restoring
the workspace and measuring the editor,
then reveal the saved view directly; initialization failures expose recovery UI.
Progress comes from actual storage, recovery, Git, configuration and editor
readiness boundaries. Animation timing must not manufacture progress or delay
readiness. Steps that do not apply are skipped, not reported as completed.

Use a stable HTTP scheme, host, and port for the editor. Development and preview
are different origins and do not share IndexedDB. Browser storage is subject to
its persistence and quota model; export, recovery, and durability
behavior must be explicit. Direct `file://` packaging checks do not establish
browser-storage support.
