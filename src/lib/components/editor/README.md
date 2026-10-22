# Editor interface

`CodeEditor.svelte` owns the CodeMirror view, per-document selection state, and
dynamic reconfiguration. Each document-changing transaction is sent to the
application separately; no debounce or editor-local undo stack merges changes.
Programmatic repository restores carry an annotation to avoid creating another
edit. Existing CRLF line endings are preserved when emitting document content.
The application remembers selections and both scroll axes per file. The editor
captures outgoing state before file changes and teardown, then restores after
font/layout measurements or when a hidden Editor pane becomes visible. User
input cancels pending restoration; only previously focused editors regain focus.
An explicit `restoreEpoch` replays a workspace's selection and viewport even when
the same file remains active. `flushSession()` lets the parent capture the current
position before recording a deliberate workspace action.
Document callbacks include each transaction's starting and resulting selections,
so undoing a replacement can restore the original selected range.

The second header's Format document icon requests the local formatter. The editor
captures a document generation, rejects obsolete results, and applies granular
changes in one transaction while mapping selections and retaining the viewport.
Formatting is an ordinary undoable action; unchanged output adds no revision.
See the [formatting service](../../formatting/README.md) for providers and config.

Fresh settings use Dark mode with the Bonfire palette, Geomini at Medium interface
size, and JetBrains Mono at 13px with 1.7× line height. Indentation uses two spaces
and a tab width of four. The initial HTML uses the same dark Bonfire appearance;
saved preferences and the first-paint appearance cache remain authoritative.

`SettingsPage.svelte` edits global, repository, and selected-file preferences,
showing inherited values and reset controls. Its parent persists settings and
applies the resolved values. Appearance uses the shared semantic palette roles.
The shared Settings scope dropdown follows Settings in the top breadcrumb;
the application binds its selection to the settings fields. Repository and file
scopes are offered when their corresponding context is available.
All choice fields use that same owned dropdown, including icons, checked options,
keyboard navigation, right-click opening and the shared menu colors.
`EditorColorSettings.svelte` provides searchable color mappings after Editor
typography, with palette swatches, optional two-source mixes and selection opacity.
Parameter background and Parameter text control ordinary function-declaration
parameters and their bound uses; methods and arrows keep their existing colors.
It shares the editor's color adapter so its previews match the rendered tokens.
Personal and repository settings inherit by role and use their own settings
Undo/Redo; row inheritance and pane reset retain all existing defaults. These
appearance controls are omitted from file settings.
Toolbar settings independently control the Editor, History and Settings buttons.
Editor groups Undo/Redo with Staged history, Zoom in/out, then File diff, Commit,
Commit history and Git operations. Format file remains its own action.
These choices use personal defaults and repository overrides. Settings reset
actions start hidden; the other buttons start visible. File settings do not
change toolbar visibility. Hidden buttons retain their keyboard commands.
Settings undo/redo and scope reset include the visibility choices.

`HistoryPanel.svelte` hosts the per-repository staged and commit graphs in a
resizable right-hand Sheet, keeping the editor mounted and visible on desktop.
It retains graph selection, scroll, minimap and revision reveal behavior, with
independent History toolbar settings and repository-scoped Undo/Redo. Closing it
leaves Git and AI open. Dock ordering is History, Git, then AI; multiple compact
panes stack. `workspace.ts` owns safe legacy-page migration and shared sizing.

`GitPanel.svelte` shares Staging, Commits, Actions, Remotes and Stashes
between the editor and History entry points. Its buttons, tabs, dropdown fields
and file/commit rows keep their backgrounds on hover and use the shared hover foreground.
Recovery is an entry in the Actions
Operation dropdown. Its Target dropdown contains saved recovery checkpoints and
restoring requires explicit confirmation. Checkpoint selection stays separate
from normal branch/tag/commit targets; changing operation, target or tab clears
confirmation. Recovery does not show the unrelated commit identity/message form.
Overflowing tabs scroll horizontally
with the mouse wheel or trackpad; keyboard focus brings each tab into view.
Fresh Staging reviews stage all changed files when the index has no existing
selection. A repository's active review preserves explicit unstaging and partial
index contents across reopening and reload; a clean working tree resets that
review. Other Git tabs and operations in progress never trigger default staging.
Staging filenames open the working file in the editor; deleted files open their
staged comparison there. The staged diff icon opens the editor comparison, while
Working diff keeps hunk staging available in the Git pane. Commit-file selections
open separate commit-specific comparison tabs, with both sides read-only and
diagonal backgrounds; historical paths survive missing or renamed working files. Staging totals name files explicitly.
Automatic staging never persists an exclusion flag. Manual selection metadata is
bound to its source HEAD, and the earlier repository-wide reviewed flag is ignored.
It uses the shared Sheet Pane: when at least
1,000px remain beside the explorer it docks to the right of the workbench, leaving
the explorer and editor interactive. With less room it slides over the entire
viewport, including the explorer. The dock and main view share one animated
boundary, so the editor, History or Settings resize alongside the entering pane.
Git's contents retain their target width while the dock clips its slide.
An instrumented Chromium 155 check at 1440×980 (1.5 CPU cores, 3 GiB scope,
500-line JavaScript fixture) observed zero intermediate main-view widths before
this change and 3–6 after it across Editor, History and Settings. Three editor
opening/closing pairs per build used Playwright tracing, per-frame geometry and
CDP main-page layout counters. Warm editor layout time rose from a median 2.6ms
to 9.2ms during the same 180ms motion; this is added layout work for synchronized
movement, not a speedup. These are instrumented local observations, not a frame
rate or field-latency claim. The 5,000-line instrumented stress run did not finish,
so it supplies no measurements for that size. Geometry/counter artifacts are in
`tmp/test/browser/dock-motion-keeps-the-main-view-alongside-the-git-pane-4b639efe/`
(before) and `...-70244e26/` (after), each named `git-dock-motion.json`.
Pane entry/exit and opening a diff use short transitions with reduced-motion
alternatives. Git actions and edits do not replay the pane entry. Switching Git
tabs replaces the upper section immediately, without a separate entrance slide
or fade. This keeps the cards and shared commit form stationary during tab changes.
Repository-scoped commit drafts survive closing, reopening and layout changes.
Actions default to Create merge commit. Merge, Rebase and Delete branch offer
only other local branches; Rename branch includes the current branch. Cherry-pick,
Revert and Squash offer commits, Delete tag offers tags, and Reset/Create tag
accept branches, tags or commits. Empty target lists disable the selector and
action. Switching operations retains a valid selection or selects the first
applicable target; explicit choices survive reopening. Merge and reset methods
are remembered separately.
The Git pane's left divider shares `WidthDivider.svelte` with the repository
explorer: the same delayed hover, pointer capture, keyboard steps and drag
cancellation apply to both. Git starts at 320px. A resized width persists as
workspace metadata and takes precedence
when reopening or reloading, separately from file history. Its displayed width
stays at least 320px, reserving 560px for the editor when opened alone or sharing
the dock with the other panes while reserving 320px for the editor. Smaller viewports clamp the
display without replacing the saved preference. Compact mode stays full-width.
An explicit History or Git resize captures the displayed dock widths for its
preview, keeping neighbouring panes and drag limits stable even when saved
preferences exceed the available space. Accepting the resize saves that visible
arrangement; cancelling restores the previous preferences. Checking out the
current commit is disabled, and a skipped checkout does not close the Git pane.
Commit changes and Git operations select their target tab when another Git tab
is active, and close the pane only when their own tab is already active. This
applies in both views, opening Staging
and Actions respectively. Their commands behave the same way. Commit inspection
opens the requested view directly.
Headers, tabs, cards, dropdowns, file icons, switches and filled focus states use
the same semantic roles and shared controls as the rest of the editor.
Dropdown labels include the spacing above their triggers in the label's click
area. Hover stays active across the label and trigger; keyboard focus and
disabled controls keep their own palette states.
Docked Git header and tab dimensions follow the main view's measured border and
content boxes, including wrapped headers and tab scrollbars. Toolbar heights and
tab text centers match across the seam at every interface size. Compact Git
layouts use the same default row dimensions independently of the covered view.

`ChangeGraph.svelte` displays private repository revisions as an accessible list
with connected Git lanes derived from actual commit parents. By default it shows
the selected revision and its first-parent ancestry in one lane, using projected
visible ancestors for private history. Private undo also keeps the newest retained
continuation through that revision visible, so Undo/Redo can move along the line
without hiding the redo steps. One numeric tag to the left of each junction expands or collapses all branch
paths at that junction. It counts their combined revisions. Other junctions
retain their state, and nested tags appear only when their parent path is visible.
Merge-only connections participate in their junction’s toggle.
Message motion is bounded by the expanded junction timestamp and the newest
revealed branch timestamp, including existing messages inside that interval.
Older and newer messages remain visible; insertion-related row shifts alone do
not select them for animation. Opening first adjusts the retained messages by
the width needed for the added lanes, keeping them visible. It then reveals the
branch rows downward as a shared block. Once their space is open, continuous
strokes grow from the junctions, around the bends and up the complete vertical
runs. Row fragments are joined into temporary SVG paths measured once at the
settled layout. One distance animation draws the paths and shows nodes as the
tip reaches them; nested branches begin when their junction is reached.
Existing branch lines stay visible. New messages fade in, in place, after the
strokes reach their tips. Closing fades out the removed messages while retracting
the same strokes, folds the tree while holding retained messages in place, then
adjusts those messages to the narrower tree.
Each stage keeps its normal 180 ms duration. Easing belongs to the beginning
and end of the sequence; the shared vertical reveal and opening strokes move
at a steady pace so they do not repeatedly restart their acceleration.
Message viewports and unchanged rows stop inheriting the animated stroke distance;
only the temporary paths and arriving nodes consume it.
Each row sizes its SVG rails to its own connections. Opening lanes elsewhere
does not resize those rails, and only arriving nodes receive animation-distance
metadata. Unrelated rows therefore keep their DOM and minimap paint cache intact.
Message width changes reflow text within the available pane rather than moving
it outside its viewport. Heights and spacing stay intact inside each branch
block. Vertical expansion and folding change only the shared clipping viewport;
its contents stay stationary. Nested reveals keep independent groups. Reduced
motion skips the visual transitions, and model changes or unmounting cancel pending motion.
Expansion is local display state, resets per repository and on reload, and never
changes Git or undo/redo. Loading a retained private revision makes it the
collapsed mainline; inspecting a source commit still leaves HEAD unchanged.
Full history remains available, including retained futures after undo.
It marks the current revision with its node independently
of list order. Each entry shows zero-padded numeric date/time in the browser's
locale and time zone, with a two-digit year, in a pill before the abbreviated
hash pill and message. The date/time pill uses the second foreground color as
its background; the hash pill uses palette color 4. Both use the first background
color for their text.
Scoped prefixes such as `docs(mt5-eventbus):` become a joined two-part pill for
the type and scope before the message; a breaking-change `!` stays with the type.
Date/time, hash, type and scope text share one explicit monospace typography rule,
including size, weight, line height and font features.
This only changes presentation, leaving the stored commit message intact.
Messages render Markdown headings, emphasis, lists, quotes, code, tables and safe
links. Hashtags such as `#123-45` become inline tags; `# Title` is a heading.
Code and escaped hashes stay literal. Blank lines separate paragraphs with a
compact 4px gap; single line breaks and code spacing remain intact.
Raw HTML stays text, and images show their alt text
without fetching remote resources. Links open separately from revision selection.
Entries grow independently with their
content. Commit rows and their metadata have no hover tooltips.
File changes append their affected line numbers inline in the message's font,
separated by commas, using the actual Git parent comparison. Changes affecting
more than ten lines per file show line counts instead of explicit ranges, retaining
added/deleted labels and both counts when the old and new totals differ.
Added and deleted lines are labeled; differing old/new ranges use
an arrow. Deleted lines refer to the parent revision, not the current document.
Multi-file changes identify each path, and binary changes do not invent lines.
Each row stretches its SVG connections with the message, keeping wrapped text
aligned with its node. History uses a `Staged changes` / `Commit history` tab row
matching the Git pane's tab height, selected fill and divider colors. Its 40px
toolbar uses the shared toolbar palette, and its dock has the same 2px left
divider as Git and AI. History is opened from the editor's history controls,
not the Page dropdown. The commit graph uses the same renderer for ordinary source commits
reachable from HEAD and existing source refs. Both graphs align to the left directly
on the page background, without cards, repeated headings, or an inline commit form.
The History panel owns scrolling; graphs do not create nested scroll areas.
Selection is remembered per repository and participates in application
undo/redo. `Staged changes` graph rows load their private repository revision on click,
Enter or Space, keeping History open and recording an undoable application action.
The full row uses the second background color at 50% opacity on hover or keyboard
focus, with a 120ms fade that respects reduced motion. The focused current revision
uses the full second background color. Staged changes undo/redo centers and focuses
that restored row in the History viewport. Pending writes finish before loading;
source commits and branches remain
unchanged. `Commit history` rows check out the selected source commit with a detached HEAD;
the branch dropdown returns to a branch.

`FileTree.svelte` and `FileTreeItem.svelte` render repository paths as a directory
tree with folders before files. The parent owns expansion, roving keyboard focus,
and explicit file activation; recursive items own rows and nested groups. Folder
expansion and focus never open a file. Selected paths reveal their ancestors when
the user switches an open tab, creates a file, or renames it. Collapsed groups are
rendered on demand. Repository changes mount a keyed tree with that repository's
saved expansion and focused row; ordinary edits keep its expansion state.
An explicit `restoreEpoch` reapplies saved expansion and focus without remounting
or automatically revealing a collapsed ancestor. `ontoggle` distinguishes a
deliberate click or keyboard expansion from passive focus and automatic reveal.
Folder groups slide open and closed in 180ms; reduced-motion preferences disable
the animation. Open/closed folder icons indicate expansion without arrow controls.
`FileTreeGuides.svelte` draws connecting lines in the third foreground color,
with a 4px curve at the final sibling’s elbow.
During a move, a non-interactive shadow row previews the normal sorted destination;
its ancestor route uses the fourth foreground color, and the target folder uses
that color at 50% opacity. Preview nodes never enter keyboard navigation or the
repository file list, and disappear on drop, cancellation, or leaving the tree.
Devicon file glyphs use their own compositing layer so their antialiased edges
do not leave stray pixels when a folder slide moves neighboring rows.

Tree, treeitem, and group roles expose the hierarchy. Arrow keys navigate visible
items and expand/collapse folders; Home/End move to the first/last visible item.
Enter/Space open files or toggle folders. This adapts the owned Operations tree
interaction pattern to file navigation, with semantic colors and local icons.

`FileName.svelte` supplies a Bits UI context menu for file/folder tree names and
open-file tabs. Tree menus expose Change name and Delete file or Delete folder
without opening a file or expanding a folder. Tab menus instead expose Open in
split view and, while a split is open, Close split view. Rename edits the
basename in place: Enter saves, Escape or
leaving the input cancels, and validation errors keep the draft available.
Deletion confirms the targeted path and, for folders, explicitly includes all
contents. Both operations use the repository service and private Git history;
folder rename preserves expansion and updates descendant open tabs and the
selected document. Each complete folder mutation is one undoable revision.
`SplitEditor.svelte` composes another editable `CodeEditor`, with its own selection
and scroll state, syntax support, minimap, language engine and file settings.
Diff tabs in primary and split panes use the same 45-degree surface-colored
background stripes as the old side of a comparison, including when focused.
The selected diff tab renders its stripes at 25% opacity.
Each pane has its own tab bar; its file menu can split it again, and its close button removes only that pane. Closing the final primary tab promotes the next pane. Selecting primary tabs continues to choose the primary document; choosing Open in split
view inserts another pane immediately to the right of the source pane. Panes have stable identifiers and independent positions, including multiple views of the same file. Both panes autosave through the
application's existing Git-backed transaction queue. Same-file views mirror each
other without recording duplicate edits. Opening/closing splits is persisted navigation, outside file undo/redo. File
history preserves the current panes and tabs while restoring document positions.
Split entrance motion releases its transform when finished so sticky minimaps retain normal scroll coordinates. Minimap canvases and viewport overlays stay clipped to their own gutters. Temporary tab navigation rejects edits through a transaction filter instead of reconfiguring unaffected panes.
The complete tree row and file-tab surface, including padding and icons, is the
context-menu target. `data-file-context-target` identifies that surface; FileName
forwards its right-clicks at the original pointer position and cleans up the
listener on unmount. Ordinary clicks and inline text-editing menus stay native.
Folder menus also offer New file. The existing creation form starts with that
folder's path and places the caret after the trailing slash. Creating a file
opens it in the Editor and uses the normal single-revision repository operation.
`RepositoryContextMenu.svelte` covers sidebar background space with a root-level
New file action, independent of the selected file. Row menus and interactive
controls keep their own context handling; cancelling creation leaves history intact.

Tree rows support dragging files and folders within the current repository.
Folder rows accept drops into that folder; file rows use their parent directory,
and the branch header or empty explorer space targets the repository root.
Valid targets get a translucent background, and hovering a collapsed folder briefly
expands it using the existing slide transition. Moves drain pending edits, preserve
open tabs and expanded descendants, and use the same atomic, undoable repository
operation as renames. Collisions never overwrite files. Internal drags from another
tree, into the dragged folder's descendants, or during blocked operations cannot
move entries. Cancelled drags do not change repository history.

Computer file/folder drops copy into those same targets in the current repository.
The native drag data is captured synchronously, then `drop-files.ts` reads files
and recursively drains directory entry batches. The application locks repository
navigation while reading and drains pending edits before adding the complete batch
as one undoable change. Failures never partially add or overwrite files. Existing
tabs stay open; dropped files do not open automatically. Git metadata requires
Import directory to preserve the separate repository and its history.

`App.svelte` composes the repository explorer, open files, history,
and these views. Durable repository operations run through the repository
service; pending edits are flushed before file or repository navigation. A loaded
tab publishes its active selection immediately and releases the editor before its
workspace-history entry finishes saving. Navigation entries and subsequent edits
remain ordered in the existing persistence queue; further tab switches do not wait
for metadata-only entries. Hidden History controls do not reconfigure their disabled
state while switching files. Failed writes keep the visible text available for download and require explicit
reloading before editing resumes.
Workspace metadata remembers the selected repository and page, each repository's
ordered tabs and active file, editor positions, tree expansion, and sidebar,
tab-strip, History and Settings scrolling. New imports start without an open
file; revisiting a repository restores the user's previous choices. Closing all
tabs preserves an empty editor. Rename/move carries positions to the new paths;
missing files and folders are pruned when restoring or checking out a branch.
Small layout snapshots use versioned localStorage independently of repository
contents, settings and Git. Writes are batched during interaction and flushed
synchronously on unload/pagehide, including the editor's final capture. Invalid
snapshots fall back to an empty workspace; storage errors are visible without
blocking repository edits.
Startup stays covered by the static loader until the saved page and scroll
positions are measured. CodeEditor signals readiness after fonts, language
loading and viewport restoration; focus is restored after the app leaves its
inert startup state. The same gate applies when a development update remounts App.
The page dropdown switches views without a global busy state. File navigation drains
accepted writes and locks editing and mutation controls without disabled-color
changes. The latest file request wins; HMR still waits for the active navigation.
The top header holds repository and page dropdowns alongside save status. The
repository menu also contains New repository and Import directory. Both menus
mark the current selection and share the file context menu's styling.
The sidebar's branch dropdown forms the file-tree root. It lists local branches
with the current branch checked and separates New branch from that list. The
creation sheet creates and selects a branch from the current ordinary commit;
initial repositories must make that first commit explicitly. Branch changes drain
pending edits and refresh open files. Checkout errors preserve the current
branch and visible buffer; source-Git safety remains in the repository service.
Undo and redo occupy the second header, above open-file tabs, and remain available
with no open tabs or in another view. They follow deliberate application actions
across repositories, including tab changes, views, folder expansion and settings;
passive cursor, focus and scroll changes supply restoration context without
adding undo steps. File mutations retain their separate private repository
revisions, and normal source commits stay independent.
Each file tab has a separate close control. The selection button covers the
complete tab, including padding, while the close control stays above that hit
area. Inactive tabs keep a 50% background; the selected tab stays opaque. Hover
changes the foreground across the whole tab. Closing waits for pending edits,
keeps repository files and Git history intact, and selects the next tab to the
right (or left at the end) when closing the active file. Closing the last tab
returns to the welcome view. A failed save keeps the tab and buffer open.

During development, Vite's awaited update/reload hooks drain accepted writes and
preferences before module replacement. A failed buffer keeps that hook pending
until recovery; rejecting the hook alone is insufficient because Vite settles
listener errors. Remove lifecycle listeners when the component is destroyed.

`LanguageEnginePreferences.svelte` owns personal/repository activation, explicit
installation/update and uninstall in each engine row.
`TypeLibraryPreferences.svelte` appears after installing the current TypeScript
engine. It manages separate Browser/DOM, Web Worker, Node/Undici and ScriptHost
declaration packages, activation/inheritance, updates, removal and offline
export/import. Standard JavaScript types remain part of the engine. It uses the
shared borderless controls, notices and settings history path.
Its `NpmTypePreferences.svelte` child owns the common declaration shortlist,
expandable frameworks with included types, explicit npm search, install/update,
scoped activation and data-only export/import. Search aborts stale results and
does not run during local filtering. Package work lives in the installer worker;
metadata-only refreshes and shared notices reuse the package foundation.
`LicensesAndNotices.svelte` provides one shared, lazy-loaded notices view for core
and installed optional packages. It reads artifacts sequentially only while open
and reports packages whose notices cannot be validated against the current catalog.
Both use the shared controls. `CodeEditor.svelte` reconfigures the separate intelligence
compartment without replacing syntax highlighting or editor history.

`FormatterPreferences.svelte` similarly owns provider selection and inline package
installation, update, uninstall and optional comparison measurements. Syntax
packages are managed in `SyntaxSettings.svelte`. Each pane uses shared notices;
there are no separate package installation components.

`PageMinimap.svelte` provides Settings and History with a reserved right-hand
overview, drawing text geometry in the page’s own colors. Layout/content changes
refresh cached text geometry. The fixed one-eighth vertical scale and moving
window match editor minimaps; scrolling paints from that cache and moves the
viewport indicator without remeasuring the page. Pointer capture
supports click-and-drag navigation, with wheel and keyboard scrolling and no
additional scroll container. Observers and animation frames are released on teardown.

Page and editor minimaps hide and release their layout space when their scroll
container has no vertical overflow, reappearing when content or viewport changes
make scrolling necessary.

Page minimaps preserve computed foreground/background colors, opacity, rounded
surfaces, control fills and SVG history connections. Theme, content and layout
changes rebuild the snapshot. History rows declare independent minimap paint
surfaces: pointer and focus changes refresh only the affected rows, coalesced
into one animation frame. Transition completion refreshes their final colors.
Moving across a long graph never remeasures every revision. Scrolling continues
to paint cached geometry; Settings retains page-wide interaction refreshes.
Graphs mark a `data-minimap-scope` whose rows notify paint changes through
`data-minimap-state`. Rebuilding that scope reuses unchanged row paint entries,
updates their origins and recaptures only dirty or resized rows. Retained messages
whose columns animate declare `data-minimap-moving` for bounded frame updates.
The overview keeps following the tree during expansion and folding. Removed rows
release their cached entries; theme, font and viewport changes invalidate them.
Row capture includes the checkpoint's hover/focus pseudo-element, preserving its
fill while leaving the branch-tag gutter clear.
History has no outer left padding. The branch-label gutter uses cached text
measurements at the active interface font and size, retaining only the space
needed by the widest label. Font changes invalidate those measurements.

The shared Minimap switch defaults on for editors, comparisons, History and
Settings. Scrollbars defaults off alongside visible minimaps; enabling it shows
both controls. With minimaps disabled, native scrollbars remain available. Both
preferences use the normal personal/repository settings inheritance and history.

Editor details includes a Retained history changes per file slider (0–10,000, default
1,000), with a live count. File settings can override the limit independently;
cleanup applies at the next startup and leaves normal source commits untouched.

`KeybindingSettings.svelte` offers searchable application, editing, search, folding
and completion actions. Focus a shortcut field and press a combination to record
it; Escape cancels. Add allows alternate shortcuts, remove disables a shortcut,
and the pane reset restores defaults or repository inheritance. Conflicts are
rejected within the relevant context; completion shortcuts can share keys with
ordinary editing commands because they only consume those keys during completion.
Choices apply live, persist through normal settings/history and use personal or
repository scope. They do not override native editing in ordinary form inputs.
