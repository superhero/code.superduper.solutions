# Browser-local language intelligence

The [decision](../../../docs/adr/optional-language-engines.md) owns architecture.
`catalog.ts` owns compatible language selections. Personal defaults select the
first compatible engine; it runs only after explicit package installation.
`registry.ts` stores verified optional packages in `code-language-packages`, outside
repositories and workspace history. `client.ts` owns one editor session's worker,
20-second request timeout, package-change invalidation and 60-second idle shutdown.

`extension.ts` connects completion, diagnostics and safely rendered Markdown hover to CodeMirror.
`hover-highlighting.ts` uses the same lazy editor parsers and palette highlight
classes for service signatures and fenced documentation code. It builds inert
text/span nodes and leaves unsupported code readable as plain text.
Source edits, accepted completions and undo/redo still use the existing editor
transaction path. Diagnostics use a short scheduling delay; this does not debounce
or discard any Git history transaction. Stale buffers cannot apply completions or
show another document's diagnostics. Disabling autocompletion leaves diagnostics
and hover available. Hiding the editor, switching repositories, selecting another
engine or removing a package terminates its worker.

`engines/` adapts service libraries to a common request/result protocol. These
adapters are compiled into optional packages by `build/language-packages.mjs`;
they are never imported into the core application. The bundler rejects external
module imports and includes full notices from the actual module graph. Pure path
and browser protocol adapters replace Node entrypoints; no process is started.

| Package | Languages | Features / context |
| --- | --- | --- |
| Shopify Liquid | Liquid | Official Shopify browser server; diagnostics, completion and hover using bundled documentation, schemas and repository files |
| PostgreSQL | SQL (PostgreSQL dialect) | Diagnostics, completion and hover; optional root `postgres-schema.json` in upstream SchemaCache format, no database connection |
| Taplo | TOML | Diagnostics, completion and hover; `#:schema ./schema.json` resolves repository-local JSON schemas; no remote catalogs |
| WGSL | WGSL | wgslender diagnostics, completion and hover |
| TypeScript | JS, TS, JSX, TSX | Completion, diagnostics, hover; repository imports, standard JavaScript declarations and optional type libraries |
| HTML | HTML | Completion and hover; no HTML validator claimed |
| CSS | CSS, SCSS, Less | Completion, diagnostics, hover |
| JSON | JSON, JSONC | Completion, diagnostics, hover; repository-local `$schema` references |
| YAML | YAML | Completion, diagnostics, hover; local `# yaml-language-server: $schema=./schema.json` references |
| Markdown | CommonMark | Link completion, broken-link diagnostics and hover using repository files/headings |
| Dockerfile | Dockerfile, Containerfile | Instruction, stage and variable completion, diagnostics and hover; no registry network access |
| GraphQL | GraphQL | Syntax diagnostics; completion, schema diagnostics and hover with root `schema.graphql` |

Settings show exact package sizes and versions from the generated catalog. No
package is downloaded automatically. Explicit installation activates its supported
languages in personal settings. Personal selections merge with
repository selections per language; `none` disables and removing a repository
choice restores inheritance. File overrides cannot set language-engine choices.
There is one reviewed engine per supported language in this pass, selected for
upstream ownership and browser suitability; no unmeasured speed ranking is claimed.

All services work on local snapshots. The application caches UTF-8 source reads by
repository revision and overlays the current buffer. Binary files are skipped;
other read failures are reported. Source snapshots include supported source and
configuration suffixes, including local dependency declarations when imported.
No external schema lookup, npm/pip install, Python runtime or backend is involved.
TypeScript reads data-only local compiler options (including relative paths), but
inherited tsconfig chains and automatic type acquisition are not implemented.
Framework files, navigation, references, rename, code actions and semantic tokens
are not provided by this initial integration. Python engines are excluded at the
developer's request; highlighting and formatter packages remain independent.

Focused checks: `npm run typecheck`, source scenarios matching `language engine`,
acceptance scenario matching `language engine packages`, and browser tag
`@language-engines`. Tests cover explicit installation/activation, real editor
feedback for all twelve packages, offline operation, repository disabling,
unchanged source history, export/import and tamper rejection.

Dockerfile intelligence uses pinned `dockerfile-language-service` in an optional
local worker for completion, diagnostics and hover. Docker Hub tag requests are
disabled through an owned offline registry adapter; instruction, stage and variable
completion remain local. The build guards the replaced upstream implementation
by version and digest. Navigation and rename are not wired into the editor yet.

PostgreSQL schema metadata must use upstream `SchemaCache` JSON (not a SQL dump);
see the [upstream types](https://github.com/supabase-community/postgres-language-server/blob/5c2f5d7140b7a9c99654f889c58b49f2d692ad77/packages/@postgres-language-server/wasm/src/schema-cache.d.ts).
Taplo schema references resolve local repository files; external catalogs and
Taplo config discovery are disabled. WGSL intelligence routes `.wgsl` files
independently of the syntax-parser catalog; this pass does not add a WGSL syntax
parser or semantic-token coloring.

Liquid treats the repository as the default theme root without creating source
files; nested `.theme-check.yml` roots are detected. Built-in Theme Check profiles,
check settings, ignore patterns and repository-local roots are supported. Remote
or custom `extends` profiles are rejected. Live Shopify API/store data is not
queried. Documentation and both theme/app JSON schema sets are bundled at build
time from the pinned revision in `build/liquid-docs.json`.

Remote asset-size checks are unavailable offline; the Liquid bundle replaces
Theme Check's HTTP helper with an owned offline adapter as well as denying fetch
in its worker. No remote asset is probed while analyzing a template.

Custom filename-suffix mappings also select the analysis language. Workspace text
snapshots include explicitly mapped source suffixes, refresh when mappings change,
and exclude suffixes mapped to plain text. TypeScript uses a private analysis-only
extension alias for custom suffixes or changed script kinds, in the same directory
so normal relative imports retain their base. JSX/TSX selections preserve their
script kind. This never renames repository files or changes Git history. Markdown
includes the current mapped document in its document set regardless of suffix.

Engine installation, explicit updates and uninstall are available alongside each
language selector; the separate engine packages section has been removed.
Uninstall preserves selection preferences and terminates the affected workers.
A shared **Licenses and notices** section reads notices from installed packages,
including TypeScript's `ThirdPartyNoticeText.txt`. Package records are deduplicated
in that view without running their code. Outdated or unavailable packages produce
an explicit notice-reading error rather than silently disappearing.

JavaScript uses the TypeScript service's JavaScript mode, not a TypeScript file
alias. `checkJs` defaults to false so installation does not impose strict type
annotations or implicit-any warnings on ordinary JavaScript. Completion, hover
and syntax diagnostics remain available. Repository `checkJs: true` and per-file
`// @ts-check` explicitly opt into type checking; TypeScript retains strict
checking by default. Updated worker behavior requires updating an older installed
TypeScript engine from Settings.

The completion popup has one source when a language engine is selected. Engine
results take precedence; an empty or unavailable engine falls back to the syntax
parser's completion data. Native snippets and semantic keywords never populate
the popup concurrently or flash as two successive versions of the same keyword.

Installed engines start preparing as their file becomes active, overlapping
worker startup with the initial workspace read. Missing engines do not trigger
workspace reads. Completion activation waits 25ms instead of the default 100ms.
The application advances a resolved language-workspace cache after known editor
writes, replacing only that file's text; other revision changes still invalidate
the snapshot. This avoids reloading every dependency after each autosaved edit
without debouncing document history or hiding file/branch/history changes.

The completion boundary excludes TypeScript's `warning`-kind entries: these are
unchecked JavaScript identifier guesses rather than verified symbols. They are
removed from the option list, including when returned by an older installed
engine; their internal detail label is not merely hidden.

TypeScript and JavaScript method/function completions insert call parentheses
and place the cursor inside. Existing following parentheses are reused, and
provider snippets retain their own argument placeholders.

JavaScript/TypeScript completions retain CodeMirror’s native `if` and `if-else`
block snippets alongside semantic suggestions, replacing the bare `if` keyword.
Tab advances through their condition and body placeholders.

Conditional prefixes resolve from the local parser before contacting a worker,
so `if` snippets remain available even while semantic requests are busy.

Completion filtering allows at most two skipped characters between matched
letters. Cached suggestions are refiltered locally as typing continues.

The TypeScript engine retains standard JavaScript declarations. Settings shows
**Type libraries** after the current engine is installed: Browser/DOM, Web Workers,
Node.js and legacy ScriptHost are separate, opt-in data packages under `types/`.
Node includes pinned `@types/node` and its required `undici-types` dependency;
the other libraries come from the pinned TypeScript release. Each package retains
complete notices and uses the shared size/checksum-verified registry in
`code-type-packages`. Installation enables that library in the current personal
or repository scope; existing choices can be disabled or inherited independently.
Removal retains preferences and never alters repository files. Export and verified
offline import are available in the same card; imports preserve activation choices.

`type-libraries.ts` owns validated preferences; `type-registry.ts` reads only enabled,
current installations once at TypeScript worker startup. Declarations are parsed
as JSON data, never executed, and sent only during initialization. Package changes
restart the affected sessions. Node opt-in enables its globals without environment
guessing. Explicit compiler `types` and `lib` choices still take priority, including
empty lists. Repository declarations take priority over packaged fallbacks.
No library is downloaded at analysis time, including when compiler settings name
an uninstalled library. Existing engines need Update to adopt this package split;
the new libraries remain off until explicitly installed/enabled.

The same card offers a short common-package list and explicit npm search.
React, Express, Koa, WebSockets, common middleware/authentication/database APIs,
utilities and test declarations are community packages. MySQL2 (`mysql2`),
Elasticsearch (`@elastic/elasticsearch`), MongoDB (`mongodb`), Svelte, Vue, modern
Angular, Fastify, NestJS, Hapi, Hono and AdonisJS are labelled as shipping their own types.
Only eight common rows render initially; the remaining choices and included-type
libraries expand on demand. Filtering is local. Search contacts the public npm
registry only on submission, aborts stale requests, and bounds results to 30.
Exact-name search can also find a package with its own declarations. Deprecated
stubs are rejected on installation and excluded when search metadata identifies them.

`npm-types.ts` resolves npm versions and required declaration/peer dependencies,
verifies npm's archive integrity, and extracts declarations, package metadata and
full notices. The existing Lezer TypeScript grammar identifies dependency strings
in declarations while excluding documentation examples. Runtime dependencies
whose types are not referenced are skipped; explicit `@types` dependencies remain
included. `npm-types.worker.ts` owns download, decompression, archive validation
and offline import validation. It never executes package code or lifecycle scripts,
and never writes repository files. Downloads use only the public npm registry,
omit credentials and reject redirects. Archive paths, checksums, file counts,
dependency counts and compressed/expanded/total sizes are bounded. Dependencies
live under the selected package's private virtual `node_modules`, preserving
independent installed roots. The resolved versions and original integrity metadata
travel in the artifact as provenance; updates are explicit.

Missing license files fail installation. The sole reviewed supplement reuses
`build/licenses/locate-character-3.0.0.txt` for that exact MIT release, guarded by
both manifests' license declarations and the published archive integrity. It does
not substitute a generic license for unknown packages or changed releases.

`npm-type-registry.ts` atomically stores payloads and small metadata separately in
`code-npm-type-packages`, with shared package-change notifications. Listings do not
clone declaration payloads. Installed artifacts are checked again before loading;
their payloads are decoded only during language-worker initialization. Explicit
activation uses the same personal/repository preferences and settings history as
the built-in library choices. npm export/import preserves the checksum and validates
declaration paths; importing local declaration data does not establish independent
proof of registry origin. Imported repository declarations still take priority.
Shared notices include these packages and their declaration dependencies.

These declarations improve JS/TS API intelligence; they do not add framework
component/template language engines. The optional `npmTypesLive` Cucumber profile
checks real React, Express and Svelte packages against the public registry, without
credentials, then verifies editor completion offline. Ordinary browser scenarios
use deterministic npm fixtures and never depend on the live registry.

Hover documentation renders Markdown with raw HTML disabled and images reduced
to text. Long popups scroll inside their frame and remain bounded by the viewport.
TypeScript's first-line signature boundary is preserved even when that line is
empty, so documentation-only hovers still render their first paragraph as Markdown.
Empty or whitespace-only replies, metadata without a signature or documentation,
and Markdown without rendered text do not open a popup. Render content before
CodeMirror creates its frame so missing information cannot flash an empty box.
