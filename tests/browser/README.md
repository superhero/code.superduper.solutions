# Browser scenarios

The opt-in `pagesLive` profile verifies a reviewed Pages distribution against
`CODE_PAGES_URL` (the production domain by default) and the local JSON manifest
selected by `CODE_DEPLOYMENT_MANIFEST`. It checks application startup, effective
isolation headers, the corresponding-source link, every served asset's bytes and
SHA-256, and real Roslyn/Taplo installations from split static downloads. It uses
fresh browser contexts and writes `tmp/test/cucumber-pages-live.json`; ordinary
offline browser runs do not contact the deployment. A loopback HTTP candidate
server is also supported for verification before publication. Use the pinned
Playwright browser, or the existing explicit `BROWSER_EXECUTABLE_PATH` override.

The `pagesBehavior` profile runs the existing editing, import, local Git, vault,
and formatter scenarios against the published editor. Set
`BROWSER_TEST_BASE_URL=https://code.superduper.solutions/` to use the live origin;
without that explicit override, the harness serves the local production build.
The override accepts only that HTTPS hostname and rejects credentials, alternate
ports, paths and query strings. Development-only fixtures remain excluded.
Each scenario gets a fresh isolated browser context, and vault tests use only
synthetic credentials with intercepted provider requests. The profile writes
`tmp/test/cucumber-pages-behavior.json` and retains normal browser diagnostics.
Run it with the pinned toolchain and `BROWSER_TEST_RUNTIME=local` when using a
local Chromium executable:

```sh
BROWSER_TEST_BASE_URL=https://code.superduper.solutions/ \
  BROWSER_TEST_RUNTIME=local \
  node node_modules/@cucumber/cucumber/bin/cucumber.js \
  --config cucumber.config.mjs --profile pagesBehavior
```

`@auto-stash-ui` exercises dirty commit checkout and return through the real Git
and History panes, preserving partial staging and independent edits on both
versions across reload. Branch cases also verify that selecting another branch
at the same commit preserves pending edits without restaging them.

`@pane-resize` checks crowded History/Git/AI docks with normal and reduced motion:
current-commit checkout stays disabled, merging another branch at the same commit leaves the
pane open, and reopening retains usable dividers. Real pointer drags, Escape,
keyboard resizing and reload verify stable neighbours, cancelled preferences,
persisted widths and unchanged source and editor histories.

`@staging-performance` imports six files, including two 400-line JavaScript
documents and `.editorconfig`, and opens split editors, History, Git and AI.
After one warm-up cycle it measures three cycles of Unstage all, Stage file,
Unstage and Stage all. Timings start on the actual pointer click and end at the
ready UI observed on an animation frame; they are local workflow measurements,
not field INP. Playwright tracing is stopped only for these measurements, then
restored. CDP page-duration counters and a separate Chrome diagnostic trace
record script, style, layout and paint work without adding nested durations.
Worker message counts check that index changes do not reread working files or
editor rules and refresh Git status only once. A held journal request checks
input locking and the unchanged commit label; real source/index/private-history
checks verify the result. `STAGING_REFRESH_OUTPUT` saves the compact measurements;
`STAGING_REFRESH_BASELINE=true` records the original behavior without applying
the optimization-specific assertions. `BROWSER_TEST_HTML` can select a retained
production HTML artifact for comparisons; optional packages and icons still
come from `dist`, so use artifacts with matching dependencies and packaging.

`npm-types.feature` (`@npm-types-browser`) checks the curated declaration shortlist,
explicit npm search, dependency-aware editor completion, scoped activation,
archive integrity rejection, notices and offline package export/import. It serves
small deterministic npm archives; package JavaScript is never executed. The
explicit `npmTypesLive` Cucumber profile uses `live/npm-types.feature` to check real
React, Express and Svelte declaration archives against the public npm registry,
then verifies completion offline. It uses no credentials and never modifies the
imported repository's dependencies. Normal browser runs do not contact npm.

`ai-vault.feature` (`@ai-vault-ui`) checks the global header Vault page, keyboard
navigation, reload, cleared drafts on unmount and absence of AI vault buttons.
It uses real worker cryptography and IndexedDB
with synthetic credentials. It covers saved OpenAI profiles, reload and peer-tab
locking, guarded clipboard use, encrypted export, compact layout, worker-owned
API dispatch, batched IPC and split credential echoes. Native Chromium WebAuthn
PRF is checked with a virtual authenticator; physical/synced providers remain
unverified. OpenAI requests are intercepted, so no paid inference or live-account
compatibility is claimed. Recovery downloads and canaries belong only to the
isolated test vault. API keys are never retrieved from existing worktrees.

`ollama.feature` (`@ollama-ui`) checks explicit local discovery, inert streamed
Markdown, frame-batched rendering, cancellation, reopening and compact presentation.
Its `@ai-interruption-ui` cases check centered Skull indicators for interruptions
and a Verified indicator for successful completion, their tooltips and replacement
by the spinner on the next turn.
Its `@ai-markdown-ui` cases retain visible Markdown markers and inline formatting
in the composer, independent draft undo/redo, Shift+Enter and unchanged sent
source. Replies cover mdit extensions, stable completed blocks and selections
through stream completion, escaped HTML and images without network requests.
`@ai-markdown-presentation` checks six heading levels, restored list markers,
nested paragraph spacing, inline code without a fill, and scrolling confined to
the message. It captures the same document in two palettes, both modes and docked/
compact panes, then exercises its disclosures and tabs. Screenshots and computed
geometry are visual/structural evidence, not a performance claim.
`@ai-mdit-catalog` checks extended source formatting, tabs and keyboard navigation,
spoiler disclosure, scoped anchors, idle media, explicit image activation, and
local MathJax SVG while offline. `@ai-mdit-imports` imports a real browser
repository, checks nested includes and code regions, and verifies that inference
still receives original directives.
`@ai-stream-stability` replays a streamed Markdown link three times, checking that
formatting and completion never retract the height already shown. It also checks
retained height across tab switches and natural reflow after resizing. Geometry
samples and a Chrome layout trace are stored under the scenario's ignored artifact
directory; these are instrumented observations, not latency measurements.
`AI_LAYOUT_BASELINE=true` records the same workload against a pre-fix production
build and expects the original retraction, for a bounded comparison only.
`@ai-growth-motion` samples the expanding reply's geometry, checks that growth has
intermediate sizes without retracting, preserves reader-controlled scrolling, and
switches to immediate sizing when reduced motion is requested. Frame samples are
functional animation evidence, not an elapsed-time improvement measurement.
The `@ai-math-ui` scenario renders inline and display LaTeX in both roles while
offline, verifies loaded embedded math fonts and rejects external resource requests.
Conversation cases cover offline tabs, separate runtime/model choices, drafts
and request payloads, background stream ownership, tab closure, overflow and
keyboard selection. A focused scenario checks Session titles and
right-click/keyboard Rename, cancellation, and reply ownership during renaming.
Connection cases check saved names and edit/new modes, persistence of the default
profile, separate connection creation, and URLs restricted to connection settings.
Only the selected transcript is rendered.
`@ai-generation-time` verifies result text on the icon's left and first-response
plus total time on its right, visible only on hover or keyboard focus and
dismissed with Escape. Headers and documents contain no timing. Both measurements
remain frozen. Its synthetic monotonic clock
avoids waiting for minute-long inference. Presentation source scenarios check
the five-second and one-hour unit thresholds. The browser case also checks local
user timestamps, alignment and that metadata stays out of provider payloads.
It uses mocked local responses. `ollama-rendering.json` records the 513-delta
fixture's active-reply DOM mutations (text and block updates) under the normal browser harness;
this is a structural guard, not a timing comparison. Real local Ornith inference
is opt-in through the `ollamaLive` profile and excluded from ordinary offline runs.
See the [adapter guide](../../src/lib/assistant/README.md) for the command and
runtime requirements.

`resources.feature` exercises the production Resources page with real storage
counts, charts, responsive/keyboard navigation and reload. Focused fixtures cover
unavailable/denied APIs, manual memory privacy, disappearing databases, shared
unfinished requests, continued sampling across views, and observer cleanup on pause and browser-tab hiding. Its live vs
paused cost scenario records three alternating pairs of 4.25-second page
performance windows without tracing/snapshot overhead during measurement; raw
values remain in ignored browser artifacts. These counters exclude worker and
browser-process CPU and impose no arbitrary timing threshold.
The logarithmic history fixture supplies 1,024 synthetic readings without
repository writes, then checks shrinking age spacing, CSS pixel columns,
metric switching and readable labels across narrow and wide chart sizes.
Shared tooltip scenarios also verify keyboard explanations, disabled actions and
clicks through a popup over an adjacent control; a floating layer must not block
the dense Resources/header toolbars.

`syntax.feature` checks rendered token colors, live light/dark changes, embedded
Markdown languages, modern and legacy parsers, and contrast in all 21 palettes
and both modes. These checks also enforce the offline request boundary.
`scope-colors.feature` checks JS/TS/JSX/TSX globals, enclosing bindings, imported
names and locals, parent-scope function calls, aliases and shadowing, edits and Undo, both diff panes, and
minimap output. Every palette/mode checks contrast,
secondary foreground pill fills for globals, primary foreground fills for parent bindings, and
the equal global/parent mix for imports. Both modes check that Settings retains
thirteen swatches, functions retain their existing swatch, and operators
use the new thirteenth swatch. The former
generated-hue search and its cache are no longer used. Global and parent-scope pills also
check their inset, rounded corners, independently mapped text, and partial
selections without changing token geometry in the editor and both diff panes.
Arrow captures stay local to their shared `this` context across JS/TS/JSX/TSX;
ordinary function/method captures keep their pills. Converting an arrow to a
normal function, Undo, and Redo update those markers live.
Declared and builtin classes retain type coloring instead of scope pills across
JS/TS/JSX/TSX and both diff panes; class-to-variable edits and Undo/Redo update
pill eligibility without suppressing ordinary parent references or globals.

`operator-colors.feature` checks arithmetic, comparison, assignment, logical,
bitwise, access and keyword operators, JS/TS arrows, spread/rest, optional markers,
generator stars and semicolons in the editor and both diff panes. Negative samples preserve
object/type colons, strings, comments and regular expressions. Embedded JS,
Python operators and live stylesheet changes are also covered. The scope palette
matrix checks exact operator swatch use in all 42 palette/mode pairs, and the
minimap checks operator pixels alongside scope colors. Bonfire's requested deep
plum stays exact in dark mode and is exempt from the operator contrast assertion;
the original six accents and scope mixes keep their contrast checks.

`color-mapping-settings.feature` checks custom token colors in the existing editor,
both diff panes and minimap; matching Settings swatches; parent/import mix ratios;
selection color/opacity; reload, reset and repository inheritance; separate global
and repository settings Undo/Redo across reload; and unchanged source/edit Git
histories. It also checks all controls and palette swatches at 1440, 760 and 390px
widths, filtering and omission from file settings. Source scenarios validate
recipes, reference ordering, persisted input, per-role inheritance and opacity.

`function-parameters.feature` checks JS/TS/JSX/TSX parameter text styling and bound
uses, unchanged method/arrow/function-expression parameters, both diff panes,
editing and Undo/Redo, configurable parameter colors and inheritance, embedded
HTML/Markdown and minimap background pixels beneath the foreground glyphs.
Partial parameter selections are checked in the editor and both diff panes,
including selection visibility above argument pills, unchanged geometry and cleanup on collapse.
The scope palette matrix measures parameter text contrast against the editor
background. Source scenarios cover destructuring, defaults, rest parameters,
captures, shadowing, method scopes, var redeclarations and shared analysis caches.

`folding.feature` checks code-fold slide midpoints, gutter/placeholder and keyboard
controls, reduced motion, interrupted animation, and unchanged Git histories.
Header geometry stays fixed through both transitions, including tight line spacing
with either editor font.

`selection.feature` checks consistent single-line, multiline, and multiple-range
selection fills, readable selected syntax, and active-line highlighting during and
after selections in both modes.
It also checks matching-token outline fragments on wrapped text, unchanged line
and character geometry, and clearing the outlines when selection collapses.

`navigation.feature` checks that page selection and file tabs never briefly repaint
unrelated controls as disabled, and that rapid file switches preserve pending
edits and honor the latest requested file.
`tab-selection.feature` separates visible selection/editor readiness from durable
navigation persistence using Chrome Performance metrics with DOM tracing paused.
`TAB_SELECTION_OUTPUT` optionally writes timing samples for comparison. Held worker
writes verify that primary and split/diff tab selection, subsequent navigation and
editing remain usable before metadata saves, and survive reload afterward. A longer
history checks that file switching leaves hidden history controls untouched.
`workspace.feature` checks per-repository tab/active-file restoration, saved page,
editor selection and scrolling, sidebar expansion/scrolling, deliberately closed
tabs, corrupt snapshot recovery, and unchanged Git history after restoring layout.
`@scroll-performance` profiles the same 3,000-line document near its start and
end with one, two and four panes. It records Chrome main-thread CPU time, script,
layout/style work, JavaScript heap use, frame intervals and per-pane minimap
paints/readbacks in the scenario artifacts. Timing values are measurements,
not machine-dependent pass thresholds; structural assertions cover redundant
work and scroll distance. `SCROLL_PROFILE_OUTPUT` optionally copies the JSON
measurements to a chosen path for before/after comparison.
`split-editor.feature` inspects coupled pane/tab motion at the start, midpoint
and end of two- and three-pane splits. Live editor geometry stays fixed during
the slide, minimaps follow their pane edge, and reduced motion skips the copies.
`pane-diff.feature` checks named comparison tabs within split panes, independent
simultaneous comparisons, bounds, close/promotion, tab dragging and reload/undo/redo.
`split-resize.feature` checks dragged two- and three-pane dividers, tab/minimap
alignment, reload and one-step undo/redo, unchanged file revisions, keyboard
controls, minimum widths, drag cancellation and independent scrolling afterward.
`tab-drag.feature` uses native browser drags to check insertion markers, tab
ordering within a pane, transfers between two/three panes, independent file
sessions, duplicate consolidation and empty-pane promotion. Reload and undo/redo
retain the layout without file revisions; cancellation, external text drops and
Brave/Linux-style focus interruptions preserve the expected workspace.
`@split-wheel` checks native wheel input at 1.5× with smoothing off across three
focused/unfocused panes, fractional wheel accumulation, and unchanged syntax DOM
when the idle scroll-position save runs.
`@scroll-quality` reviews all 20 slider speeds in each of the three panes with
smoothing on/off and reduced motion on/off. It checks distance, easing, direction,
pane isolation and horizontal page units, plus line/vertical page/Shift input at
representative speeds, fine input, interruption and switching diff drivers.
Three-pane boundary and reversal cases cover the minimum and maximum speeds
with smoothing on/off, without moving neighbouring panes or the page.
`@scroll-minimap` covers three-pane keyboard/pointer navigation, speed extremes,
reduced motion, short and wrapped documents, and disabling/re-enabling minimaps.
`workspace-history.feature` checks the shared application undo/redo timeline:
tab opening, selection and closure with restored order and document position;
interleaved edits across reloads; folder, page and settings changes; repository
switches; and divergent redo. It also checks shortcuts from the empty editor and
preserves native text-field undo, replacement selections and tree keyboard focus.
History assertions avoid navigating to inspect
the journal, because changing pages is itself an action in this timeline.
`startup.feature` checks the standalone loading screen with application scripts
disabled, held worker reads, cached appearance, and restored tabs/scrolling before
the workspace becomes usable. It also checks error recovery and reduced motion.
A development scenario hot-replaces the copied application component and checks
the same loading boundary, restored document focus, and unchanged browser document.
`loading-gallery.feature` checks all nine real startup stages, their completed and
skipped states, the pinned development preview, and reduced-motion animation.
Held metadata and active-file reads verify that compact screens follow current
work before reporting the restored editor ready. Viewport thresholds and resizing
verify two-column layouts with two, three, or four rows, and the roomy three-by-three
layout, without scrolling. Wide-window checks cover the 480/481-pixel height
boundary and retain nine cards at 600, 650, and 651 pixels high.
`keyboard.feature` checks default Tab indentation, selected-line outdent, Escape
navigation, and repeated Git undo/redo without refocusing the editor. A held worker
request verifies focus and read-only editing protection while further shortcuts queue.
`header-navigation.feature` covers the repository and page dropdowns, narrow
header layout, selected checkmarks, context-menu colors, keyboard selection and
focus restoration, directory import through the menu, and accepted writes while
switching pages or repositories. Shared page selection lives in `navigation.helpers.mjs`.

`branches.feature` checks local branch creation and selection, checked menu
choices, committed files and source history after switching, dirty-file safety,
reload, invalid names, and the initial-commit requirement.
`history-view.feature` checks the Staged changes/Commit history tabs,
selection per repository, reload and undo/redo, with
responsive navigation and no inline commit form. `history-hover.feature` profiles
pointer movement across 30 and 1,500 rendered rows with Chrome Performance metrics
and optional CPU profiles (`PROFILE_HISTORY_HOVER=true`). The fixture expands real
row DOM without writing synthetic Git revisions. It records main-thread/script/style
costs and frame intervals, and separately counts style/geometry reads to enforce
bounded per-row hover work without machine-dependent timing thresholds.
`HISTORY_HOVER_OUTPUT` optionally copies the measurements for before/after review.
`change-graph.feature` checks
real parent connections, retained futures, current revisions, changed-line
summaries, reload persistence and continuous graph geometry.
`dropdown-context.feature` checks right-click parity for repository, page, and
branch menus, including trigger icons/text, repeated opening, browser-menu
suppression, unchanged selection/history, and Escape focus.

`tab-close.feature` checks inactive, adjacent, and final tab closure without file
deletion or new Git revisions, pending edit persistence, and keyboard focus.
A deliberately delayed stale write verifies that failed saves retain their tab
and visible buffer when closing is requested.

`file-actions.feature` checks filename context menus, inline rename cancellation
and collision recovery, tab preservation, confirmed deletion, Undo, and keyboard
focus. `borderless-interface.feature` checks focused filename triggers, rename
validation, tabs, menu and dialog controls, and Settings surfaces without borders,
outlines or shadow rings, while retaining CodeMirror's matching-token outlines.
Settings choice fields also share header dropdown colors, checked options,
keyboard selection and focus restoration.
`folder-actions.feature` extends those file actions to complete subtrees,
including preserved expansion and descendant tabs, one Git revision per operation,
similarly named neighboring folders, and restoration through Undo and reload.
`folder-paint.feature` compares every sidebar pixel before and after repeated
folder collapse, including interrupted expansion. It verifies a visible sliding
midpoint and subtree removal, so disabling animation cannot hide paint artifacts.
`context-targets.feature` checks row and tab padding, file/folder icons, and close
icons with real right-clicks: the correct menu replaces the browser menu at the
clicked position without opening, toggling, selecting, or closing an item.
`file-icons.feature` checks locally bundled Devicon glyphs, monochrome filename
colors, matching tree/tab icons after rename, and Material folder/fallback icons.
`context-create.feature` checks creation from collapsed folder rows and blank
navigator space, folder-prefix focus, root targeting, cancellation, collisions,
and the resulting file selection and single Git revision.
`file-drag.feature` uses native dragging to move files/folders, preserve pending
edits and open tabs, target folders or the repository root, and verify undo/redo.
Collision, no-op, descendant, and cancelled drops preserve repository contents.
Development cases cover dropping after hot replacement and animated folder
expansion, plus temporary window focus loss in both Editor and History. The focus
event is simulated because Playwright intercepts drags before the OS handles them.
The destination-preview case checks sorted placement, highlighted ancestor guides,
an unchanged source before dropping, and successful drops directly onto the shadow.
`external-drop.feature` uses trusted Chromium desktop-drop events with real files
and directories. It verifies binary bytes, nested names, unchanged source Git and
open tabs, atomic collision rejection, and batch undo/redo across reload.

Run `npm run build` followed by `npm run test:browser`. The default runner uses
the exact pinned Playwright Docker image, disables container networking, and
mounts the project read-only except for `tmp/test`.

The suite serves the built page on an ephemeral loopback address. Development
scenarios copy `src` into an isolated directory under `tmp/test/browser`, add
test-only diagnostic and UI fixtures, and run Vite with an ephemeral loopback port and
cache in that directory. They do not inject errors into a developer's running
application or depend on ports 5175/4175. UI fixtures exercise the actual shared
components independently of the editor's repository state.
Toolbar lifecycle scenarios also open a second page and restart the isolated
server, checking that existing toolbar state survives another tab and RPC
access returns after Vite reloads the page.
Editor lifecycle cases request a real Vite full reload and change only the copied
stylesheet for a hot update while document transactions are still saving. Both
must preserve every accepted Git revision and its final file contents.

Each scenario gets a fresh Chromium context. Unexpected network destinations,
runtime exceptions, error console messages, and failed HTTP responses fail the
scenario. Deliberately injected error messages are explicitly allowed only in
their own diagnostic scenarios. Production scenarios additionally require no
runtime asset requests beyond the HTML document and its declared ICO, PNG, and
Apple touch icon URLs. JavaScript, CSS, and fonts must remain embedded. The fixture
serves the page, generated optional formatter packages and the nine explicit
favicon exports, with their image MIME
types; unexpected paths remain errors. Icon cases verify all export URLs and
decode SVG, ICO, PNG, and Apple touch PNG in Chromium. Serving the additional
formats does not claim Chromium can decode PPM/TIFF or emulate Safari Home Screen
behavior.
Playwright suppresses routed requests ending in `/favicon.ico`. The ICO cases
therefore fetch that exact URL with Playwright's HTTP client and pass the returned
bytes to Chromium's image decoder through a data URL; no alternate fixture image
stands in for the published ICO.
Duplicate-toolbar warnings fail the suite, including warnings from the second
page used by the lifecycle scenario.

Editor scenarios use the public repository/file controls and CodeMirror input,
then verify durable Git history, reload, undo/redo, source commits, directory
import, stale-tab rejection and preference inheritance.
Scenarios requiring a source commit use an explicit fixture step: it sends the
existing repository worker's `open`/`commit` requests with isolated string IDs,
restores its response handler and reloads the page. This creates actual Git
objects without adding product controls or claiming commit-form UI coverage.
Directory import cases exercise complete source Git history, separately selected
submodule metadata, cancellation, invalid selection retry, and actionable path
errors through the actual file inputs and worker.
Directory-tree cases cover nested expansion, natural ordering, repeated file
names, keyboard navigation, and explicit activation. File-selection helpers
expand ancestors before addressing lazy-rendered descendants; focus and
expansion must never implicitly open a document.
Palette scenarios read
the browser's computed semantic colors and disabled page dropdown colors in every
palette/mode combination.
Recovery scenarios use a development-only storage fixture that interrupts the
durable journal at named checkpoints, reopens the service, and inspects real Git
objects and files in IndexedDB. This fixture is never imported by production.

To deliberately use an existing local Chromium-family browser instead of the
container, run the same assertions with:

```sh
BROWSER_TEST_RUNTIME=local BROWSER_EXECUTABLE_PATH=/usr/bin/brave-browser npm run test:browser
```

The path must identify an installed browser; omit it to use Playwright's
installed Chromium. The local mode retains request interception and all suite
assertions, but it has no container-level network isolation. It is an explicit
fallback, never an automatic response to unavailable Docker.

Top-level `.feature` and `.steps.mjs` files are discovered by the `browser`
Cucumber profile; `support.mjs` is loaded explicitly. Keep mutable state in
the scenario World because scenarios may run in parallel. Cases belong in
individual scenarios or scenario-outline examples, not hidden test loops.

`formatting.feature` explicitly installs and exercises real formatters from the
production page,
including durable undo/redo and unchanged-output behavior. Development scenarios
hold worker requests to verify stale results cannot replace typing, switched tabs
or restored history. Formatting errors, disabled states and absence of implicit
formatting are covered without an external formatter server.
`formatter-packages.feature` covers zero startup downloads, offline reuse after
reload, removal, export/import, complete notices, checksum rejection and retry,
cancellation, explicit updates with failed replacement preservation, and removal
from another tab. Jupyter scenarios cover nested Python/Markdown/fenced-code
formatting, unchanged notebook metadata/outputs, missing providers, invalid JSON,
offline use and one-step undo/redo. The test server serves the exact generated package bytes; no
external network access is allowed.

Every scenario attaches its browser identity to the Cucumber report. Failures
save diagnostics, a screenshot, and a Playwright trace under
`tmp/test/browser/<scenario-id>/`. The runner log is
`tmp/test/browser/runner.log`; the report is `tmp/test/cucumber-browser.json`.

`formatter-preferences.feature` exercises every added community provider through
the real toolbar, explicit user selection, independent installations, per-language
repository inheritance with undo/redo/reload, embedded selection propagation, and
persistent on-device comparisons that cannot change selections. Installation
scenarios cover schema-1 package preservation during metadata-index migration.
The build prepares checksum-pinned non-npm Wasm artifacts before the isolated
browser runner starts, so its container still requires no external network.

`@language-engines` covers all twelve opt-in language packages, explicit activation,
real editor diagnostics/hover, offline use after reload, repository-level
disabling, analysis without source-history edits, and package export/import with
tamper rejection. The fixture host serves the same generated package bytes as
the production distribution; no external language service is used.

`@fourmolu` covers explicit Haskell formatter installation, `.hs` and `.hsig`,
local `fourmolu.yaml` indentation, HTML-like/Unicode string preservation, one-edit
Git history with undo/redo, offline reuse after reload, and syntax errors without
formatting revisions. The official Wasm build runs entirely inside the formatter
worker; no native Haskell process is available to the tests.

Dockerfile coverage exercises explicit language-engine activation, diagnostics,
offline reload, repository disabling, and independent selection of the optional
language-service formatter as a single Git-backed document change.

PostgreSQL, Taplo and WGSL scenarios cover explicit installation and activation,
diagnostics, offline reload and repository disabling. PostgreSQL and Taplo also
exercise local schema completion offline and Git-backed undo. PostgreSQL and WGSL
formatter scenarios verify independent installation and one document revision.

Liquid scenarios cover explicit installation/activation, diagnostics, offline
reload and repository disabling, plus bundled documentation hover, global-object
completion with undo, and repository snippet completion while offline.

`syntax-packages.feature` covers included GraphQL/WGSL highlighting without engine
downloads and optional HCL installation, activation, offline reload, repository
overrides, settings undo, removal, export/import and checksum rejection.

Handlebars scenarios cover stable mixed-template highlighting and block folding,
explicit beta installation/selection, fenced code, offline reload, repository
provider overrides, settings undo and stable fallback after removal. Production
package checks retain both providers' applicable notices.

`filename-mappings.feature` verifies adding a custom suffix, immediate highlighting
without source mutation, reload persistence and undoable repository overrides.

`history-retention.feature` configures the live per-file retention slider, edits
two files, reloads through real startup compaction, verifies both independent
budgets and current content, then checks retained undo. Source scenarios cover
zero-limit divergent paths, redo, private-object collection, stale revisions and
interruption before/after publication while preserving ordinary source Git.

`keybindings.feature` records shortcuts through Settings, verifies conflicts,
disabling, inheritance and reload, and checks native form undo, contextual
completion acceptance, reserved Save remapping, focused split tab/diff actions
and split formatting with application undo.

`edit-grouping.feature` verifies continuous typing/deletion as one graph entry and
Undo/Redo step in normal, split and editable diff views, including reload with
redo pending. Browser interaction cases cover pauses, cursor moves, blur, paste,
newlines and reload. Source scenarios verify row validation, scoped boundaries,
retention and every repository/application journal interruption point.

`history-messages.feature` checks concise parent-to-result subjects in normal,
split and editable diff views, plus explicit whole-document formatting in a split
and message persistence after reload. The formatting scenarios also check that
format actions use `Format document`. Source cases cover subject bounds,
Markdown escaping, complete grouped changes and interrupted format recovery.

`history-performance.feature` exercises 100-file repositories through real document
transactions separated by explicit cursor moves into distinct logical edit steps,
measures repeated undo/redo with Chrome's Performance domain, and
checks that editor instances survive. A separate scenario sends rapid history
shortcuts without waiting between requests, then verifies all transactions and
reload persistence. Timing samples are diagnostic attachments rather than
machine-dependent pass/fail thresholds. Source `@history-performance` scenarios
assert bounded file/object IO, one repository snapshot per application navigation,
and recovery of interrupted incremental restores.

Set `PROFILE_HISTORY=true` when running the browser performance scenario to also
save `history.cpuprofile`, `history.trace.json`, and `history-timings.json` in its
`tmp/test/browser/<scenario-id>/` artifact directory. Load the CPU profile in
Chrome DevTools' Performance panel or the trace in a Chrome-compatible trace
viewer. The trace includes the rendering and repository worker threads, storage
activity, and action boundary marks. Compare ordinary timing runs separately:
recording the full trace adds overhead. For example, after building:

```sh
PROFILE_HISTORY=true BROWSER_TEST_RUNTIME=local BROWSER_EXECUTABLE_PATH=/opt/google/chrome/chrome \
  node node_modules/@cucumber/cucumber/bin/cucumber.js --config cucumber.config.mjs \
  --profile browser --tags @history-performance --parallel 1
```

`toolbar-buttons.feature` checks independent Editor, Settings and History toolbar visibility, persistence,
keyboard commands with hidden controls, Settings undo/redo, global and repository
inheritance and reset, file-scope exclusion, and narrow-screen layout.

`default-settings.feature` checks fresh appearance/typography defaults, saved
appearance and tab width after reload, and the dark Bonfire HTML before JavaScript.


`local-git.feature` checks the common editor/History review panel, exact index
commits with later working edits, hunk staging, identity/message entry, reload,
compact layout, non-mutating commit inspection, the local operation menu, and
conflict recovery/resolution through the public worker API in an isolated profile.
`@git-hover-ui` compares foreground and background colors while hovering Staging,
Commits, Actions and Stashes controls, including tabs, selected commit rows and the
disabled checkout button. Dropdown checks verify unchanged hover backgrounds across
labels and their spacing at desktop/mobile widths, alongside keyboard focus fills.
`@commit-diff-ui` opens two versions of a deleted working file in independent
read-only editor comparisons, verifies both diagonal backgrounds, rejects typing
on either side and restores the selected commit after reload without Git changes.
Source workspace cases cover comparison identity, rename, split moves and promotion.
`@git-targets-ui` checks operation-specific target lists with real branches, a tag
and a commit, disabled empty selectors, invalid selection replacement and current
branch exclusion after switching branches.
`@git-recovery-ui` restores a real amendment checkpoint using the shared Operation
and Target dropdowns. It checks the empty state, confirmation reset on operation
and tab changes, and preservation of normal targets and commit drafts. Overflow
navigation uses the supported large monospace interface setting so the shorter
tab row still needs scrolling in the fixture.
`@git-staging-ui` covers default full-file staging, staged file previews, explicit
filename navigation to editable files, deleted-file comparisons, file and hunk
selections, excluding every file, and preservation across reopening
and reload. It also verifies that other Git tabs leave staging alone and a clean
commit starts a fresh default review for subsequent edits.
The staging fixture also resumes an existing source repository with two modified
files and stale review metadata from an earlier build or source HEAD.
It also checks docked geometry and continued editing, full-viewport compact
presentation, draft preservation across resize/reopen, focus restoration and
reduced-motion behavior, with wide and compact screenshots.
Its resize scenario exercises drag direction, cancellation, keyboard bounds,
reopening/reload persistence and temporary viewport clamping, while asserting
that both file histories remain unchanged. Explorer resize scenarios also cover
the shared width divider.
The dock-motion scenario samples opening/closing geometry in Editor, History
and Settings, retaining main-page CDP layout counters in `git-dock-motion.json`.
It verifies intermediate main-view widths and a shared moving boundary, rather
than accepting a correctly positioned final screenshot alone.
Source `@local-git` scenarios cover Git operations, staging splits, binary and
untracked preservation, ignored paths, packed objects, reset modes, rewrite
checkpoints and crash recovery at every repository journal boundary.

`remotes.feature` (`@remote-ui`) checks explicit SDK installation, verified
import/export/removal, encrypted connection storage and unlocking after reload,
and the GitHub, GitLab and Bitbucket repository browsers and collaboration panes.
All provider API requests are intercepted. Full clone, fetch and pull run through
the real browser worker against a disposable local `git http-backend` fixture;
push review is checked without sending a write. These scenarios never contact a
real upstream or use account credentials. Source `@remote-git` scenarios exercise
publishing, lease races and interrupted receipt recovery on local fixtures only.

`@ai-harness-ui` checks Settings → AI instructions/tool switches, Pi replay of
repository tool results, expandable activity, per-model context budgets/usage,
independent new connections and middle-click tab closure. The source
`@ai-harness-source` scenarios cover Pi validation, bounds and cancellation.
The separate `harnessLive` Cucumber profile is an opt-in local Ornith adapter
probe; its output goes to `tmp/test/ai-harness-live.json`.

The Pi browser fixture also replays `read_settings`, `git_log` and `git_status`
results from the selected repository, alongside the source scenarios for Git
reference/path validation, pagination, cancellation and read-only projection.

`@ai-skills-ui` imports a standalone SKILL.md through Settings, edits and toggles
it, verifies metadata-only system advertising and Pi's full-body load_skill
replay, then checks reload persistence and removal.

`@ai-git-together` checks independent Git/AI visibility, simultaneous restoration
after reload, side-by-side desktop layout, compact vertical stacking and closing
either pane without closing the other. `@workspace` covers persisted multi-pane
normalization and bounded shared dock widths, including legacy snapshots.

`@history-pane` verifies that opening History preserves the editor, resizes and
restores independently, retains graph selection, shares the desktop dock with
Git and AI in that order, stacks on compact layouts, and closes independently.

`@history-branches` checks the default one-lane mainline, numeric tags to the
left of junctions, one combined count and expansion/collapse of all sibling
branches at a junction, keyboard activation, unchanged repository data, and
collapsed restoration after reload. Animation checks cover retained messages
making only the horizontal room needed for added lanes, a shared tree reveal
followed by continuous strokes growing from the junctions, then new messages fading in place.
Closing fades only removed messages and retracts the connectors, folds the tree
while keeping retained messages in place, then adjusts their width. Checks sample the message
positions and shared block at different progress values, preserve commit heights
and spacing, leave messages outside the reveal timestamp interval visible and
horizontally fixed, and exercise a nested reveal without restarting its parent.
The checks hold native animations for deterministic sampling at the normal 180 ms timing
and verify opaque strokes grow from and retract toward their junctions.
Quarter-point samples verify steady progress through the middle tree and
opening stroke stages, avoiding repeated ease-in restarts. Before that pacing
change, the shared viewport revealed only 1.66% of its height at 25% elapsed;
the same production-browser check now requires 25%, within rounding tolerance.
Pixel samples check both the painted prefix and unpainted remainder during growth,
and verify the completed line remains continuous across row boundaries. Nodes
appear as the growing tip reaches them. Branch contents
stay stationary beneath the vertical reveal, and retained mainline segments
remain visible while the branch folds.
Model navigation cancels an unfinished
reveal without leaving hidden messages or pending animations. Layout snapshot fixtures
expand each junction.
Native playback also checks that fully revealed nodes have their painted
connecting lines at the normal speed, without pausing the animations.

`@history-branch-performance` uses the production graph with 250 synthetic
mainline changes, a 102-revision branch and a second junction with two branches.
Only render metadata is injected through the fixture worker reply; real stored
history is unchanged. During native expansion and keyboard collapse it checks
that an unrelated offscreen row receives no DOM mutations and at most one initial
minimap style/geometry capture. A fresh complete
capture is the pixel oracle for the cached overview after opening and closing.
This is a cache-correctness and bounded-work check, not a machine timing threshold.

`@browser-models-ui` checks the six-profile UI without model downloads, real GPU
capability reporting, saved controls, worker cancellation, bounded synthetic
weight ranges, SHA-256 rejection, local offline reads, shared-file removal leases
and resized images passing through the existing Pi adapters. These fixtures
do not constitute new hardware/model/OCR performance evidence.
