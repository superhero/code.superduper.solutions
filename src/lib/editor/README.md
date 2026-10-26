# Editor behavior

`edit-grouping.ts` groups adjacent typing, composition and deletion on one row
into one durable History and Undo/Redo step. It captures the group before saving
is queued, so a storage backlog cannot change the 1.5-second pause boundary.
Cursor/selection changes, newlines, file/view changes, blur, paste, formatting and
history replay end it. Selection replacements and multiple cursors are isolated.
Ordinary, split and editable diff views use the same rules; external mirrored
updates never create another edit. Every accepted transaction still saves
immediately through both private history journals.

`workspace.ts` validates versioned UI snapshots, reconciles missing repository
paths, and carries saved file/folder positions through moves. It stores only
paths, view choices, selections and scroll offsets; repository content and Git
history remain in IndexedDB. The application owns localStorage access and reports
failures separately from repository persistence.
History, Git and AI open independently in that order to the editor's right.
Their open states and preferred widths are workspace metadata that restore after
reload; available space clamps displayed widths without replacing preferences.
History keeps the editor visible, retaining each repository's graph choice and
scroll. Legacy History-page snapshots migrate to Editor with the History pane
open. When multiple panes cannot fit beside a useful editor, they stack in the
compact right dock. A single compact pane uses the shared full-width Sheet.
Editor scroll positions stay local during movement and report to the workspace
after 120 ms of inactivity. Selection, edits, navigation/history capture and page
exit flush synchronously. Blur captures the session immediately and publishes
it in a microtask if the document is still mounted, avoiding workspace mutation
when Svelte removes focused editor DOM. Teardown separately preserves its final
captured position. Restoration context stays current without rerendering every
pane on every scroll frame.
Split components stabilize primitive file identity before resolving settings or
loading `.editorconfig`. Replacing a pane's session record must not restart its
syntax parser or language engine.
File undo/redo also preserves the active repository identity, unchanged file-list
identity and settings objects. It restores document sessions without replaying
explorer expansion or page scroll restoration. Configuration rules reload when
relevant; repositories without `.editorconfig` files avoid that extra pass.
`split-motion.ts` moves the current panes and their tabs together with an incoming
split over 240 ms. Inert visual copies preserve text, scroll offsets, canvas
pixels and minimap positions while live CodeMirror views receive their final
width once. Copies disappear on completion or new input; reduced motion skips
the slide. Additional splits use the same transition without replacing existing
editor views.
`PaneDividers.svelte` resizes adjacent panes through pointer capture and one
preview update per animation frame. Tabs use the same column sizes. Minimum
widths adapt to the available space; keyboard arrows and Home/End also resize,
and Escape cancels a drag. Only a completed resize enters application history.
Workspace `paneSizes` stores repository-specific proportions, preserved through
reload, undo/redo, additional splits, closing and primary-pane promotion.

Each split keeps an ordered tab list and per-file sessions alongside its active
file. `moveWorkspaceTab` reorders tabs or transfers them between panes without
file mutations. Transfers select the destination tab, retain its existing view
when already open, and close or promote panes only when the source becomes empty.
`tab-drag.ts` owns native tab dragging and a vertical insertion marker in the
button/link hover color. The held tab is a cursor-following DOM copy with explicit
opacity and an opaque palette background, so inactive-tab transparency is not
applied a second time. A transparent native drag image avoids browser/platform
opacity overrides.
It accepts only a live drag from this application's repository, scrolls overflowing tab strips at their edges, and clears indicators
on cancellation. A transient native-window blur clears decoration while retaining
the drag identity for Brave/Linux. Each completed move is one workspace action.

Each repository remembers its History pane's `historyView` (`changes` or
`versions`); older or invalid snapshots default to the `Staged changes` view. Graph
selection is persisted as workspace metadata; file undo/redo leaves it in place.
File reconciliation and renames preserve the choice and the existing shared
History scroll offset.

`file-icons.ts` resolves local Devicon glyphs for source languages and common
configuration files. Test/spec filename segments (`.test.*`, `.spec.*`) use the
Material Symbols Experiment icon before other rules. Specific basenames/configuration
patterns take precedence over extensions, matching is case-insensitive, and only
the basename is used.
Unknown types retain generic Material Symbols. The tree and tabs share this
resolver through `FileIcon.svelte`, including after rename; icon detection does
not select a CodeMirror parser or change file contents.

`file-tree.ts` derives a sorted directory hierarchy and its visible traversal
from repository paths. Full paths identify nodes; display names retain their
original spelling. The Svelte file-tree components own expansion and focus;
these derived nodes do not copy or modify repository content.

`git-graph.ts` lays out actual commit-parent edges from child-before-parent Git
records. Retained futures get separate lanes until their shared ancestor; merge
commits retain every parent edge. Empty lanes are reused without moving continuing
branches, and missing parents stop without connecting unrelated changes. Row
segments let the Svelte graph keep lines aligned when commit text wraps.
Scoped private history supplies `graphParents` for the nearest visible ancestors
through omitted snapshots. Layout uses these connections while preserving actual
Git `parents` for metadata and file comparisons; hidden checkouts do not break
otherwise continuous history lines.
When projected paths share a hidden baseline, layout supplies a compact decorative
junction. It has no edit metadata or selection action; unrelated missing parents
still stop without connections.

`commit-markdown.ts` renders commit messages with the maintained Markdown parser,
raw HTML disabled. Hashtags such as `#123-45` use local tag styling; a heading
requires Markdown's separating space (`# Title`). Code, escapes, link labels and
URL fragments keep literal hashes. External HTTP(S) and mail links open separately
with opener/referrer protection; relative and fragment links remain plain labels.
Images render escaped alt text without network requests. Soft breaks render once,
and blank lines separate standard Markdown paragraphs without extra spacer rows.
Nested lists and code retain Markdown's own whitespace semantics. The Svelte
graph gives paragraphs a compact 4px gap while keeping commit pills and
changed-line suffixes inline.

`drop-files.ts` adapts native desktop drops to relative paths and binary bytes.
It snapshots readable drag entries during the drop event, retains dropped folder
names, and drains every directory-reader batch before passing a complete set to
the repository service. Read failures and unsafe paths reject the whole drop.
This adapter is covered by focused source scenarios; the sidebar integration uses
browser scenarios with native file drops.

`settings.ts` validates browser preferences and resolves global defaults,
repository overrides, and repository `.editorconfig` indentation. Preferences are
separate from repository content and Git history. Legacy file overrides are
discarded during normalization, including settings restored from history.
Tab indents by default; Shift+Tab outdents, and Escape then Tab leaves the editor.
Version 1 preferences migrate the former global Tab-focus default to indentation;
repository overrides and new explicit focus preferences remain supported.

`settings-tabs.ts` defines the eight Settings categories. Workspace metadata stores
the selected category and independent scroll positions without putting view state
in preferences or repository files. Normalization accepts known category IDs only
and keeps the old Settings position as Appearance's fallback.

`editorconfig.ts` reads applicable repository configuration without changing
files. It owns the supported indentation properties and nested matching rules.

`configuration.ts` composes official CodeMirror extensions directly. It does not
install CodeMirror history: keyboard and native input undo/redo invoke the
repository service. Language support is local syntax/completion support, not a
formatter or language server. Changes to this DOM adapter require browser
scenarios; settings and configuration parsing have source scenarios.
Temporary repository locks use CodeMirror's read-only state without removing
contenteditable, retaining focus and repeated undo/redo shortcuts. Tab stays in
the editor during these locks when indentation is enabled.
The fold-gutter preference controls visible folding controls; keyboard folding
shortcuts remain available independently.
Text selections default to the primary foreground at 20% opacity across all rows,
including the native fallback, diff panes and minimap. The active-line highlight
stays visible during selections, including Git change tints, and selected text
retains its syntax colors. Collapsing the selection keeps the same active-line styling.
`selection-background.ts` keeps each logical row bounded to its selected text,
without filling empty space to its right. Touching wrapped/bidi fragments join
without rounded seams. Exposed corners retain a 4px radius, and separate
selection ranges remain independent. Native cursors and iOS selection handles
still belong to CodeMirror.
`match-outlines.ts` draws token matches and matching bracket pairs in the same
CodeMirror layer without changing text layout. Each visual fragment, including
wrapped tokens, gets a solid 2px outline with 4px corners and no offset, using
palette color 8.
`bracket-scope.ts` uses those same native bracket matches to draw a palette-8
scope guide 3px inside the scope's indentation column: 1px dots with 4px gaps,
starting 7px below the opening line and ending 7px above the closing line.
It spans multiline pairs, follows nested scopes
and scrolling, and disappears for folded or single-line pairs. The existing
bracket-matching setting controls both the endpoint highlights and the guide.

`fold-motion.ts` slides code folds open and closed in 180ms with ease-in/out,
including both diff panes. Folded headers retain a two-pixel bottom line using the minimap background.
During unfolding it stays in the animation image, then disappears when the
slide finishes; the native unfolded header has no boundary.
Incidental layout transactions and programmatic scroll events preserve the slide. Native folding
transactions stay synchronous; an inert viewport snapshot animates clipping and
transforms instead of changing CodeMirror's measured layout or resizing the
snapshot each frame. A temporary old-viewport cover holds the image through CodeMirror's first
measurement pass; the slide uses the settled layout and scroll anchor so its
last frame matches the native editor. A scroll snapshot retains the existing
viewport anchor instead of pinning an unfolding function to the document end. A per-view minimum content height reserves trailing blank space when a fold
would clamp the current scroll position. The header and everything above it
stay fixed; only the lower section moves. The reserve is recalculated on the
next fold and cleared by document edits; the minimap and native scrollbar remain visible. Input, wheel gestures, document switches, and
reconfiguration cancel the snapshot. Reduced motion bypasses it. This DOM adapter
is covered by the folding browser scenarios, outside source-coverage scope.

`languages.ts` wraps CodeMirror's language catalog and the Svelte, GraphQL, WGSL, stable Handlebars and Makefile parsers.
Filename detection and the settings selector share its stable identifiers.
Language support loads on demand and is cached; production embeds all 148 included modes locally,
including parsers for Markdown fences. Unknown files remain plain text. Language
support varies by grammar and does not imply semantic diagnostics or an LSP.

`highlighting.ts` maps theme slots 7–13 to seven syntax accent roles; slots 1–6
retain the interface colors. Types default to the function color; comments also use
italics. `javascript-scopes.ts` resolves value references in the parsed file:
known, unshadowed ECMAScript/browser/Node global candidates get a dedicated
accent; bindings in an enclosing lexical scope get another. Direct locals keep
their existing syntax colors. Runtime import bindings and references have their
own accent in every scope, including default, named, aliased and namespace imports.
Local declarations still shadow imports. Type-only imports do not shadow values,
and unknown unresolved names keep their existing
appearance. Unshadowed `undefined` uses the same plain value color as `null`,
without a global scope pill. A declared or imported binding named `undefined`
keeps its normal binding style. Function parameters and their direct body share the same visual
scope; nested blocks have their own. Default parameters cannot see body locals.
Ordinary function-declaration parameters use the declared function-name color as
their background, with the editor background as contrasting text. This covers
their declarations and bound uses, including destructuring, rest/default values
and captures in nested scopes. Shadowed bindings, method parameters, arrow
parameters and function-expression parameters retain their existing treatment.
Object-literal methods establish their own parameter scopes, just like class methods.
Parent-scope pills compare the enclosing `this` context rather than every lexical
block. Arrow functions, blocks, loops, and catch clauses share that context;
ordinary functions and methods introduce a boundary. Binding lookup still keeps
their lexical scopes separate, including shadowing and arrow parameters.
Declared class bindings, direct class expressions, builtin constructor/type names,
and identifiers used after `new` retain Classes/types coloring instead of scope
pills. Shadowed constructor names still resolve to their actual bindings;
capitalization alone does not identify a class. Imported-name styling is unchanged.
This is lexical highlighting, independent of optional language engines; it does
not infer runtime availability, follow imports into other files, or evaluate
dynamic `eval`/`with` scopes.

By default, globals use secondary-foreground pills and enclosing bindings,
including function calls, use primary-foreground pills, both with primary-background text so they
stand apart from local text; imported names mix global and parent
colors equally. These formulas follow the active palette and mode, without hue
generation or extra scope palette slots. Settings shows thirteen swatches; the new
slot 13 belongs to operators. The six existing syntax accents retain their default roles.
The editor, both diff panes and minimap use the same
scope ranges and colors, including embedded JavaScript/TypeScript. Tree/document
identity caches analysis; selection-only updates do not repeat it. Incomplete
parses retain mapped marks until all bindings are available.

`semantic-highlights.ts` also caches the combined scope, parameter, delimiter,
literal and operator ranges by immutable tree and document identity. Scrolling
reuses that array instead of rebuilding and sorting it. A binary search uses
the widest token to find a safe viewport start, then checks only nearby ranges;
tokens crossing a viewport boundary and separate folded ranges remain intact.
Only visible tokens become editor decorations. Weak tree keys release cached
arrays with discarded trees; no additional parser or language engine is started.
Changes still resolve bindings across the complete parsed file, because an
offscreen declaration can change the meaning of a visible reference.
In a local Node 26.7.0 microbenchmark (400 functions, 47,116 characters,
8,401 highlights, final 2,000 characters visible), five alternating pairs of
100 warm calls reduced median aggregation/projection time from 2.532 ms
(2.104–3.285 ms) to 0.0043 ms (0.0025–0.0254 ms), with identical ranges.
This excludes parsing, decoration creation, layout and paint; it is not an
end-to-end scrolling measurement. Raw samples and the fixture are under
`tmp/performance/semantic-highlights/`. The cache retains one combined array
per live tree; viewport lookup adds only a cached maximum token width.

Native operator tags cover arithmetic, assignment, comparison, logical, bitwise,
access and keyword operators across languages. `javascript-operators.ts` adds
grammar ranges for JS/TS arrows, spread/rest, optional markers and access, `new`,
stars, semicolons, and template interpolation delimiters (`${` and `}`),
including embedded scripts and Markdown fences. This avoids recoloring strings,
comments, regular expressions or non-operator colons. Operators default to palette slot 13
directly; Bonfire intentionally keeps its requested muted violet (`#716d8a`) in both
modes, without contrast lightening in dark mode.

`color-mappings.ts` owns configurable color roles and their default recipes.
Settings' Editor colors pane maps local text, keywords, strings/regex, numbers and
literals, functions, parameter backgrounds/text, classes/types, properties, comments, operators, dots/access,
semicolons, globals, enclosing/imported names, invalid syntax, selection and the
active line. Users can choose any palette slot, a theme accent, a shared surface
or an earlier role, and optionally mix two sources with a percentage. Restricting
references to earlier roles prevents cycles. Persisted recipes accept only these
sources, never arbitrary CSS. Explicit palette choices use their exact colors;
the original six theme accents retain their contrast correction.

Color mappings and selection opacity use personal defaults with per-role
repository overrides, reset/inheritance and the current settings scope's Undo/Redo.
They stay outside source files. Missing mappings keep
the existing defaults. `syntaxColors` uses a CodeMirror facet to update existing
views; the same color adapter supplies Settings swatches, both diff views and the
minimap. Dots and semicolons follow Operators by default but can be mapped separately.
Selection opacity defaults to 20%; the active-line highlight remains visible
while selecting text.
Cursor-line fills use 25% opacity, including Git-modified and added rows in the
editor and diff panes. Git status colors in the line-number gutters remain opaque.
Parameter backgrounds are hidden; parameter text defaults to a 50/50 mix of the function and number colors.
Global and parent-scope references use their respective colors (Secondary and Primary
foreground by default) as inset pills with a 6px radius and matching 2px side shadows, without
blur or spread. Global text and Parent scope text default to Primary background and are independently
configurable. The same treatment applies to both diff panes and the minimap;
partial selections remain visible over the fill.
The stored color mappings can be edited independently
through the same settings controls. Minimap tokens paint their backgrounds before
selection and foreground glyphs, using the view's resolved color preferences.
Selections over opaque scope pills paint a separate overlay on just
the selected characters. Cursor-only updates do not repeat binding analysis;
native iOS selection remains browser-owned.

For the original six accents, lightness is corrected only as needed to retain 4.5:1 contrast against
both editor and palette surface backgrounds, preserving each base accent’s hue and
saturation while adjusting HSL lightness. A view plugin updates colors when the
palette, mode or stylesheet changes (including live CSS replacement) and
disconnects when the editor is destroyed.
This DOM adapter is covered by browser scenarios, outside the source-coverage
scope. Parser loading uses a separate compartment so late loads cannot replace
the selected document's language or reset its content and history.

The [editor components](../components/editor/README.md) own rendering and the
editor lifecycle. The application coordinates persistence and reports pending
or failed writes before allowing repository navigation.

Syntax highlighting settings cover the complete language catalog. The list starts
with repository languages (common languages without a repository), with search and
20-item expansion for the remainder. Included parsers default to enabled; each can
be disabled through personal defaults or repository overrides. Disabled languages
use plain text and are excluded from Markdown fenced-code parser discovery.

Optional HCL/Terraform syntax is a separate static package. Selecting Enabled
before installation shows an Install button in Syntax highlighting. Installing
also activates its personal default; repository overrides remain available. It is not part of
the core parser payload. The shared package registry verifies size and SHA-256
before storage and execution; export/import supports offline installations.
See the [syntax package decision](../../../docs/adr/optional-syntax-packages.md).

Handlebars (`.hbs`, `.handlebars`) uses `@xiechao/codemirror-lang-handlebars`
by default. `handlebars.ts` adds block folding and indentation independently of
the upstream's unreachable Jinja-style metadata, ignoring comments and raw blocks.
The shared adapter preserves HTML parsing and uses the effective indentation unit.

The Gentrace `0.1.0-beta.4` parser is a separate syntax package. Its personal or
repository provider choice never downloads it automatically; explicit installation
selects it in personal settings. Missing/removed beta packages fall back to stable. Both
providers support Markdown fences. The beta factory receives the shared HTML
language module in addition to the usual CodeMirror/Lezer modules.

Upstream parsing is not fully Handlebars-spec compliant: advanced partial blocks
such as `{{#> layout}}` can produce recovery nodes and lack block folding. Source
text stays intact and editable; no parser errors are presented as language-server
diagnostics. No complete syntax-validation support is claimed for either provider.

Makefile syntax uses pinned `codemirror-lang-makefile@0.1.1`, included and loaded on
demand. It detects Makefile/GNUmakefile/BSDmakefile, Makefile.am/Makefile.in and
`.mk`/`.mak`/`.make`, with automatic filename detection and Markdown fence support. This is basic
highlighting for comments, targets, prerequisites and recipes, not comprehensive
GNU Make parsing or a language engine. It never converts existing recipe tabs.

Language selection always follows the filename. `languageMappings` stores only
custom suffix associations, separately in personal defaults and repository
settings; built-in associations remain the baseline. The longest custom suffix
wins, case-insensitively, before built-in special-filename rules. Mapping values
may select plain text or any known parser, including optional support without
installing or enabling it. Legacy broad/file `language` overrides are discarded.

`FilenameMappings.svelte` provides searchable baseline associations and custom
suffix entry. Its dropdown's default/inherited choice removes the current scope's
association; per-setting reset buttons are not used. Settings history, reload and
live editor reconfiguration apply to mappings. Explicit associations also route
language intelligence and formatting; default formatter-specific detection remains
intact for files without custom associations.

Appearance keeps interface typography separate from the CodeMirror font. The
`interfaceFont` setting offers bundled Montserrat/Rationale and system sans,
serif and monospace families and inherits personal/repository settings. The first-paint appearance cache includes its validated identifier,
while IndexedDB settings and application history remain authoritative.

`interfaceSize` selects Small/Medium/Large (14/16/18px root text sizes), defaulting
to Medium. Interface text uses rem units so fixed-size labels, dropdowns and menus
follow the preference. Material Symbols and Devicon glyphs use the same relative scaling, preserving
the smaller square-file-icon variants. CodeMirror retains its separate pixel font
size and line height. The preference supports repository inheritance, application undo/redo and
the validated first-paint cache alongside the interface font family.

## Editor fonts

`fonts.ts` validates editor font choices and creates Google CSS API requests.
`google-fonts.json` snapshots 45 monochrome Monospace families from Google Fonts metadata
on 2026-10-17 (`https://fonts.google.com/metadata/fonts`), excluding entries with
nonempty `colorCapabilities` such as Sixtyfour Convergence. Monofett is also
excluded by product preference. Its regular, bold and
italic variants follow the catalog; license URLs point to a pinned Google Fonts
repository revision. Refresh the catalog from Google's Monospace category rather
than treating arbitrary family names or URLs as preferences.

`font-storage.ts` loads only the selected Google family online. The default is
bundled JetBrains Mono at 13px, with regular/bold and italic styles already
available offline. This family and built-in system choices do not contact Google. Install downloads the CSS-declared font subsets
and available styles plus the original license, validates font decoding, and
atomically saves them in `code.editor-fonts.v1` IndexedDB, outside repositories and
undo history. Each installation is limited to 32 MiB. Installed fonts are used
without contacting Google, including after reload. Failure leaves existing stored
fonts unchanged. No font is automatically downloaded for offline storage.
Installed optional fonts expose a Delete action in both font selectors. Deleting
removes the saved faces and license, releases active cached faces and stylesheet
slots, and updates both controls without changing font preferences or history.
Offline use then falls back through the existing font stack. Bundled defaults
show “Built in” because their bytes belong to the application distribution.

Editor font menu labels preview their own family. `FontOption.svelte` starts a
preview only when its label intersects the menu viewport. Google previews request
only the family-name characters, reuse installed fonts locally, and release their
stylesheets when the menu closes; previewing does not select or install fonts.

`interface-fonts.json` snapshots 599 upright, monochrome Sans Serif and Monospace
families from the same Google metadata, excluding color fonts, handwriting/script classifications, script/signature
families, and families whose normal styles are intrinsically slanted. Monofett
remains excluded by product preference. In particular, Englebert, Momo Signature,
Tirra, Story Script, Kite One and Timmana are excluded. Optional italic variants of
upright families remain supported. Noto Sans Old Italic describes a historical
writing system rather than slanted lettering and remains available. The interface font dropdown shares `FontSelect.svelte`, previews,
search, installation and local storage with the editor dropdown. Font catalogs
remain distinct: interface-only sans-serif families cannot become editor fonts.
Geomini is the bundled interface default; JetBrains Mono remains the bundled
editor default at 13px. Each selection owns a separate
remote stylesheet slot so changing one cannot unload the other. The early
appearance cache restores a safely quoted family name before application startup;
the validated catalog remains authoritative once settings load.

Compact families are excluded from both font catalogs, not hidden behind a user
filter. `build/font-width-audit.json` records a browser measurement of all 760
upright monochrome candidates on 2026-10-17. At 20px, each font was compared with
Montserrat using interface labels, lowercase letters, and uppercase/digits. Families
with a mean advance-width ratio below 0.82 are excluded, as are explicitly named
Condensed, Narrow, Compressed and Compact families. All measurements succeeded;
161 families were removed after excluding wide families as well. This avoids relying on inconsistent legacy width tags
(Work Sans, for example, remains available). VT323 is excluded from editor fonts,
and Rationale is no longer an interface preference; its bundled artwork use stays.
No measurement or filter runs in the application. Repeat the audit when refreshing
the catalogs, keeping the same samples, reference and cutoff for comparability.

The same width audit excludes mean ratios above 1.20 and explicitly Expanded,
Extended, Wide or Stretched families. BBH Bartle measures 2.1913 times the
reference width and is excluded. This removed another 20 interface families,
including three editor families. Both catalogs offer only the curated width
range; excluded fonts have no opt-in setting.

`completion-navigation.ts` gives completion keys priority over document movement.
Enter also waits for refreshed visible results instead of inserting a newline;
it accepts the selected suggestion when the list becomes ready.
When an asynchronous refresh leaves the visible popup disabled, arrow/page keys
are consumed and queued until refreshed options arrive. Editing, moving the
selection, dismissing the popup or destroying the editor clears queued actions.
The interaction delay is zero. Engine completions can remain valid while the
original prefix grows; replacement and snippet spans use the mapped current
completion range rather than the original document snapshot.

Alt+Shift+Left extends the selection to the current line start, overriding
CodeMirror’s syntax-node selection shortcut so it cannot reach into a prior line.

`minimap.ts` owns a per-editor canvas renderer. The right-hand canvas
shows syntax-colored blocks and a draggable viewport. It also supports keyboard
scrolling while focused. Minimap is enabled by default and can be disabled in
Editor details through personal or repository settings. It changes scrolling
context without editing source or adding history actions. Its gutter overrides
the line-number colors and padding; the editor keeps one scroll container.

Each pane caches its own parsed tokens and folded rows, and repaints on its own
scroll, document, selection, size or palette changes. Syntax color probes live
outside CodeMirror's editable DOM, avoiding document-observer mutations during
rendering. Canvas and overlay dimensions use that pane's bounded scroll viewport.
Canvas dimensions change only with pane size, token lookup starts at the visible
row, and unchanged bitmap geometry only moves the viewport overlay.
Parser loading and palette changes invalidate the appropriate caches without
replacing the minimap or moving the viewport. Browser checks compare canvas pixels
with actual highlighted token colors, including after reload and palette changes.

`scrolling.ts` owns editor wheel scaling (0.25–5×) and optional continuous eased
scrolling. Frame deltas are clamped to nonnegative values because input may arrive
after a queued animation frame’s timestamp. Settings apply live at personal/repository scope. Repeated wheel
input accumulates a clamped destination; pixel, line, page and Shift-wheel input
are normalized. Browser zoom and hover-popup scrolling keep native handling.
Fractional wheel distances carry forward after browser pixel rounding in both
scroll modes, including after easing settles. Reversing direction or navigating
elsewhere clears unapplied fractions. Page wheel units use the viewport's width
for horizontal input and height for vertical input, including Shift-wheel.
Minimap clicks and keyboard navigation share the easing; dragging stays direct.
Reduced-motion preference disables easing. External scrolling, editing and
pointer navigation cancel pending animation; saved viewport restoration remains
immediate. Scrolling remains restoration context, not an application-history edit.

`git-gutter.ts` compares the current CodeMirror document against the selected
source commit. Line-number backgrounds use the string color for added lines,
yellow for modified lines. Deletions draw a red horizontal boundary between rows,
continuing between the line numbers and across the folding gutter; they do not
color the remaining row or its number red.
Unchanged numbers and the folding gutter share the editor background.
Changed document rows also receive a 15% tint of their change color, matching the diff.
The minimap uses the same semantic colors, with red taking
priority where a deletion shares a line with another change. Baselines are cached by repository, commit
and path, never reread on each edit. Chunk updates track transactions including
undo/redo; commit or checkout changes reload the baseline. Uncommitted new files
compare against an empty baseline. Marker refreshes do not write files or history.

The minimap reads the same Git line-change state as the left gutter. Its reserved
change strip uses identical palette colors and follows edits, undo/redo and
source-baseline changes without recomputing the diff or reading Git again.

`minimap-drag.ts` owns minimap mouse gestures. Pressing outside the viewport
first scrolls to that location; continued movement in the same press immediately
drags the viewport. Pressing the viewport preserves its grab offset. Dragging
continues outside the minimap and ends on release, focus loss or disposal; it
cancels any ongoing smooth-scroll animation and never edits source/history.
The renderer shares its painted rows and offsets through `minimap-geometry.ts`.
Clicks resolve those logical rows through CodeMirror's measured line blocks, so
wrapped lines and diff spacer heights do not require an approximate scroll ratio.
Wrapped heights may still be estimates before the target renders. A temporary
logical anchor corrects them after CodeMirror's own measure/scroll adjustment;
new input cancels it, and correction is limited to six changes within one second.

The minimap renderer draws both solid change strips and a 24% background tint
from the same folded/scrolled row coordinates. It does not read canvas pixels
back or observe its own bitmap mutations to reconstruct those coordinates.
Code retains its syntax colors.

The editor toolbar opens a side-by-side comparison tab in the focused
pane, labelled `filename (diff)`, through the owned
`FileDiff.svelte` component and official CodeMirror MergeView. It compares the
same cached source-commit baseline as Git markers with the current buffer; a new
file uses an empty baseline. Both sides share editor typography, syntax palettes,
language mappings and scrolling preferences. The committed side stays read-only. Edits on the current side use the same
per-transaction saving and private undo/redo history as the ordinary editor;
source Git history remains unchanged. Read-only settings and navigation locks
also apply to the current side. Revert controls are absent. Opening/closing the diff records
a workspace action. Ordered tab keys distinguish source files from comparisons
using the reserved `diff://` prefix (invalid as a repository path). File reads,
settings, icons and reconciliation resolve the underlying filename; rename,
dragging and pane promotion retain the tab kind. The primary `fileDiffOpen` and
secondary `diffOpen` aliases describe each pane's active tab, persist through
reload, and file undo/redo never changes them or discards sibling panes or widths. The ordinary editor remains mounted to retain its cursor,
selection, folds and scrolling while the diff is visible.

The Staging tab's diff icon opens `filename (staged diff)` in the main editor,
comparing HEAD with the source index. Both sides are read-only, so later working
edits remain separate. The reserved `staged-diff://` tab kind and each pane's
`stagedDiffOpen` alias preserve that distinction through reload, tab moves and
pane promotion. Staged deletions remain inspectable without a working file.
Index changes reload the comparison. On compact layouts, opening it reveals the
editor by closing the covering right panes.

Within each changed chunk, paired old/new lines use the same modified yellow as
the editor; surplus new lines are green and surplus old lines are red. Number
and folding gutters, row tints and changed text share that classification.
Each diff pane supplies that same classification to the shared minimap, so its
mirrored change strips and full-width tints match the comparison. Normal editing
supplies the working-tree classification through the same minimap facet.
Diff gutter markers also carry change-block boundaries from those chunks. This
keeps their inner borders continuous across line numbers and the folding gutter,
whose sparse cells can be DOM neighbors despite unchanged rows or alignment gaps.
Both comparison panes honor the folding-gutter and minimap settings, including
folding shortcuts and minimap click, drag and keyboard navigation. Bounded pane
scrollers share their vertical position through `diff-navigation.ts`; each pane
keeps its own horizontal scroll position. The outer diff does not scroll.
New wheel, pointer, touch or keyboard input immediately claims diff navigation
and stops the other pane's previous animation before synchronization runs.
Opening the diff transfers the editor's visible document anchor and pixel offset
to the current-file pane after fonts and layout settle. This preserves the code
location even when preceding blocks were folded in the ordinary editor.
The ordinary editor stays visible while the comparison prepares. The committed
pane then slides in from the left as the current view moves into the right half
over 240 ms. `diff-motion.ts` animates disposable, inert visual copies using
transforms while live editors keep fixed dimensions; CodeMirror and minimaps do
not resize every frame. Closing reverses the slide before releasing the comparison
DOM. Copies preserve scroll positions and canvas pixels and are removed on finish
or interruption. Reduced motion skips both animations.
The current minimap has its own stationary visual copy at the right edge during
either slide, so it stays visible while the document image moves underneath.
The overlay preserves scrollbar insets and leaves the live right scrollbar
uncovered, so its track and thumb remain visible during the slide.

`keybindings.ts` owns the portable action catalog, chord validation, platform
modifier matching and conflict checks. Personal shortcuts and repository overrides
are metadata; an empty array disables an action, while an omitted action inherits
its defaults. `editor-keybindings.ts` replaces managed default bindings rather
than layering duplicate commands over them. Native history keys removed by the
user are consumed so browser history input cannot trigger application undo.
Autocomplete has its own contextual bindings and pending-result navigation.
Application actions route through the focused pane; form inputs keep their native
editing keys. Ctrl/Command S remains reserved when not assigned to an action.

Deleted-line markers use four-pixel block widgets: two red pixels between one-pixel
minimap-colored edges. They reserve space between code lines (or after the final
line) and align blank gutter cells, without adding text to the document.

Toolbar zoom buttons change the repository font-size preference in one-pixel
steps (7–32px), applying to its editor panes and comparisons. Shift+wheel up/down
zoom by default; Keybindings can record wheel or keyboard alternatives. Editor
wheel capture runs before scrolling and throttles high-frequency events, without
changing interface typography or repository file contents.

The workspace stores an optional explorer width (160–600px).
`ExplorerDivider.svelte` previews pointer drags once per frame and commits one
application-history layout action on release; Escape, cancellation or focus loss
restores the previous width. Arrow keys, Home and End support keyboard resizing.
The CSS width clamps responsively to leave room for the workbench.

The **Toolbar** settings card groups button visibility by Editor, Settings and
History. Global defaults and repository overrides apply independently to each
scope; file-specific preference scopes are retired. Existing editor visibility keys
retain their meaning. Settings Undo and Redo, and History Undo and Redo default to visible.
Settings Reset and Reset keybindings default to hidden. Reset keybindings lives
in the Settings toolbar and resets only the active global or repository shortcut
scope. Hiding a button does not disable its command or
keyboard shortcut.

Function, method and arrow parameter bindings and their uses have the same inset, rounded shape as scope pills, with an 80% pane-background fill. The method parameter background has its own Editor colors mapping; foreground colors remain unchanged.

JavaScript/TypeScript control-statement parentheses and body braces follow the Keywords color mapping. Function, method and call delimiters follow Functions; arrow-function parameter parentheses and body braces follow Operators. These structural colors also apply in embedded scripts and both diff panes; object literals, destructuring and unrelated grouping retain their existing colors.

Class-body braces and constructor parentheses (including `new` calls) follow Classes and types. Constructor body braces retain the function-body color.

Computed member-access square brackets follow the indexed member or binding color, including optional and chained access. Index expressions and array literals retain their own syntax colors.

Imported names use rounded pills: Imported background defaults to a 50/50 mix of primary and secondary foreground, Imports text follows parent-scope text, and their 2px side shadows match the pill background. Selection overlays cover these fills in the editor and diff panes.

Parent-scope constant references are bold for data-only initializers: primitives including null and undefined, and recursively nested arrays, objects, built-in Sets and Maps. Known const aliases and spreads are followed with cycle detection; functions, methods, accessors, classes, other instances, mutable bindings and unknown values disqualify the containing structure. This checks initializer syntax without executing repository code. Destructuring remains unknown. Arrow captures that share `this` remain local under the scope-color rules.
