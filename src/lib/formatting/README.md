# Browser formatting

`routing.ts` owns the default formatter for a filename or explicit editor language.
`client.ts` starts an inline worker on the first manual request. `engine.ts` loads
and initializes the installed formatter there; `worker.ts` serializes jobs.
No formatter writes storage. The editor validates the request's document generation
and context before applying granular changes as one transaction and Git history
action. Typing, navigation, undo and read-only changes invalidate pending results.
An unchanged result creates no action. Existing file line endings are preserved.

Formatting runs only from **Format document** in the second header. Autosave,
typing, file switching and Ctrl+S never trigger it. Unsupported or read-only files
disable the action. Errors retain the document; a 60-second timeout terminates the
formatter worker and permits a later retry.

| Files | Optional formatter |
| --- | --- |
| JS, TS, JSX, TSX, JSON/JSONC | Official dprint plugins |
| Markdown, TOML, Dockerfile/Containerfile | Official dprint plugins |
| Jupyter notebooks (`.ipynb`) | Official dprint Jupyter plugin |
| C#, Visual Basic | Roslyn through dprint’s Wasm wrapper |
| Haskell (`.hs`, `.hsig`) | Official Fourmolu browser Wasm build |
| Python, PHP | dprint's Ruff and Mago Wasm wrappers |
| HTML, Vue, Angular templates, CSS, SCSS, Less, YAML, GraphQL | Prettier core |
| Svelte | Framework-maintained `prettier-plugin-svelte/browser` |
| XML and related XML extensions | Official `@prettier/plugin-xml` |

Prettier owns embedded scripts and styles in its documents. Markdown's host
requests delegate to the same dprint/Prettier mapping, including configured fence
indentation and syntax-error policy. Unsupported fences remain unchanged; the
upstream Markdown plugin currently does not delegate PHP fences.

Jupyter delegates code cells to installed language formatters (for example Ruff
for Python) and Markdown cells to the installed Markdown formatter, which can in
turn format fences. Install those providers separately; missing providers leave
cells unchanged. Notebook metadata, execution counts, outputs and raw cells are
preserved. This formats notebook JSON in the code editor; it does not execute
cells or require Python, a kernel or a notebook server. Invalid notebook JSON
reports an error without changing the file.

Roslyn 0.23.2 formats C# and Visual Basic through the existing browser Wasm
adapter. Its approximately 49.9 MB payload remains an optional installation.
Ruby requires a native process. The current Astro plugin needs a native compiler binding or a
more involved WASI/thread adapter; Pug needs Node compatibility shims. These are
excluded rather than adding runtimes or silently downgrading framework plugins.
Community dprint providers extend the optional catalog; language servers remain
outside this feature. Archived cmakefmt is deferred. Both Typstyle adapters are
available as separate, explicitly selectable alternatives.

## User choice and recommendations

**Formatter preferences** appears in Settings for personal defaults and repository
settings. Choose a provider independently for each language/format, inherit an
individual language from personal defaults, or select Disabled. Repository maps
merge per language rather than replacing all personal choices. These preferences
join the existing application Git history, so undo/redo and reload preserve them.
Explicit installation or update selects the provider for its supported formats in
personal settings. Repository overrides remain unchanged. Removal and measurements
do not rewrite selections. There is no automatic fallback when the selected provider is missing.
File scope keeps editor overrides but does not change formatter selection.

Recommendations first prefer maintained official dprint/Prettier integrations or
framework-maintained plugins. This distinguishes an official adapter from an
engine being officially endorsed by a language vendor. Equally supported peers
can be ranked using **Compare installed**. It runs a tiny language-specific sample
in an isolated fresh worker, records first-use time and the median of three warm
requests, and includes local storage, validation and formatting overhead. It never
writes repository files or workspace history. Timings live in the separate
`code-formatter-measurements` IndexedDB database, keyed by provider and language;
package digests invalidate old results. Results are local to the device/browser
and sample, not a universal performance claim. Missing comparisons use a stable
suggestion rather than inventing a speed ranking. A new recommendation never
changes the selected provider.

Additional providers:

| Provider | Coverage |
| --- | --- |
| Pretty YAML; Pretty GraphQL | YAML; GraphQL alternatives |
| Malva; Lax CSS | Stylesheet alternatives; Malva also supports indented Sass |
| markup_fmt; Lax Markup | Markup alternatives and Astro; markup_fmt also covers template dialects |
| Gofumpt | Go |
| Typstyle (kachick); Typstyle (apcamargo) | Typst alternatives |
| Shell | sh/Bash/Zsh/ksh/mksh/dash/Bats, including common shell dotfiles |
| Lax SQL; Nix; KDL | SQL, Nix and KDL |
| clang-format | C/C++/Objective-C/Objective-C++ |
| Panache | Markdown/Pandoc Markdown, R Markdown and Quarto |
| Badness; bibtex-tidy | LaTeX and BibTeX alternatives |
| Fatou; Arity | Julia; R |

Prettier framework providers control embedded scripts/styles internally. dprint
markup, Markdown, Panache and notebook callbacks route embedded requests through
the selected language providers. Native language runtimes and language servers are
not started. Actual extensions and compatible choices belong to `formats.ts` and
`routing.ts`; provider identity/support metadata belongs to `providers.json`.

## Configuration

Effective editor indentation (personal, repository, EditorConfig and file settings)
supplies defaults. Repository formatter options take precedence. The resolver
reads the nearest dprint JSON/JSONC config or Prettier JSON/YAML config, including
the `prettier` property in `package.json` and ordered Prettier overrides. dprint
includes/excludes and the repository-root `.prettierignore` are respected.
Prettier parser overrides must belong to the selected bundled plugin.

Executable/shared configs, `extends`, inherited dprint configs and remote/custom
plugins are not loaded. Unsupported configuration produces a visible error rather
than silently using different formatting rules. Native `ruff.toml`, `pyproject.toml`
and `mago.toml` discovery is not implemented; wrapper options belong in the `ruff`
and `mago` sections of dprint configuration. Ruff lint fixes are not applied. Other dprint options use the provider's actual
`configKey` (for example `yaml`, `malva`, `markup`, `typst`, `typstyle`, `sh`,
`gofumpt`, `clangFormat`, `panache`, `badness`, `fatou`, `arity`). Native
`.clang-format` and `go.mod` discovery is not implemented; put style, `langVersion`
and `modulePath` options into dprint config. Shell dialects follow the provider's
shebang/extension/dotfile detection; set `sh.dialect` explicitly when needed.

## Optional installations

All 34 supported provider packages are opt-in under **Settings → Global defaults →
Formatter preferences**. The installation is personal to this browser origin and shared by
all repositories; repository/file overrides still control formatting options.
No formatter payload is downloaded on startup, while browsing settings, when
opening a file, or when formatting Markdown fences or notebook cells. The toolbar is disabled
until the matching package is installed. Missing fence/cell providers leave their
code unchanged.

Install downloads a versioned, content-addressed package from the application's
static `formatters/` directory. No registry queries, CDN module graph, application
backend or source-code upload is involved. The build uses pinned npm packages and checksum-pinned upstream Wasm releases;
dprint Wasm is copied unchanged, and Prettier providers are flattened into
self-contained browser ESM with their necessary parsers/compilers. Independent
Prettier packages duplicate shared code so installation and removal have no
hidden dependencies. Each package includes complete dependency license notices.
The UI reports its complete uncompressed package download size, including the
base64 envelope and notices; HTTP compression may reduce the actual transfer.

A trusted catalog embedded in the HTML pins each package's identity, version,
size, payload size and SHA-256 digest. Downloads are bounded and checked before
one atomic IndexedDB write in `code-formatter-packages`; an interrupted, cancelled,
corrupt or failed update preserves the previous package. Imported package files
must match this same catalog exactly. No arbitrary JavaScript/Wasm or remote
repository plugin URLs are accepted. Workers verify installed bytes before use.

Installed packages work offline across reloads. Package storage schema 2 adds a
metadata-only index so listing installed formatters never clones all their large
payloads. Upgrading schema 1 retains existing packages and their exact bytes. Export/Import package supports
installation without network access, including the optional `file://` packaging
mode where fetch installation is unavailable. Licenses are readable in Settings.
Remove deletes the installation, cancels pending formatting and discards loaded
worker modules; other tabs refresh through BroadcastChannel. Browser site-data
clearing/eviction also removes packages, without changing source repository files.

Updates are explicit: a newer application build advertises a reviewed replacement
through its embedded catalog; it never queries or installs an upstream “latest”.
An old/incompatible package is retained for removal or replacement, but is not
executed. Installation/removal manages downloaded resources outside the workspace
undo timeline; formatting output itself remains a normal undoable edit. Resetting
editor defaults does not remove installed packages. Deferred providers above
are not silently added to this catalog.

The main HTML embeds application code, workers, styles and fonts, while optional
packages are separate static artifacts. Named browser scenarios cover explicit
installation, offline operation, export/import, corruption, cancellation, update
failure, cross-tab removal and all supported formatter outputs. Source scenarios
cover config resolution and granular editor coordinate mapping.

## Fourmolu

Select **Fourmolu** for Haskell in Formatter
preferences. The optional package contains the official website artifact built
from Fourmolu 0.21.0.0, pinned to source/deployment revisions and SHA-256. Its
55,005,943-byte Wasm is kept as a separate resource in the package envelope, not
embedded in either the core page or another base64-encoded JavaScript string.
WASI and the owned adapter execute inside the existing formatter worker, with no
host filesystem, native toolchain, process or runtime network fetch.

The nearest repository-local `fourmolu.yaml` supplies printer options; effective
editor indent size supplies the default `indentation`. Fourmolu formats with
spaces. `.hsig` files select Backpack signature mode. The upstream wrapper keeps
AST-equivalence and idempotence checks enabled; syntax/config errors preserve
the original buffer. Highlighted HTML returned by the official wrapper is parsed
as inert data to recover source text, including entities and Unicode.

This web wrapper uses upstream's bundled fixity/dependency database, not Cabal
project discovery. Native-only `fixities`, `local-modules`, `reexports` and
`ghc-opt` options are unsupported and rejected rather than silently applied.
The full GHC/Haskell/WASI notices are included with the optional installation,
exported package and license viewer. Binary updates require notice review.

Dockerfile language-service formatting is an independent opt-in alternative to
recommended dprint formatting. Installation never changes provider selection.
It uses effective editor indentation, runs locally in a worker, and applies edits
through the existing Git-backed document transaction. Registry lookups are disabled;
no dprint or Prettier configuration is read for this provider.

PostgreSQL language-tools formatting is selectable for SQL alongside Lax SQL.
WGSL has a wgslender formatter. Both are independently installed optional modules,
including their Wasm resources. They use editor indentation; formatter-specific
configuration files are not read for these providers in this pass.

The single Formatter preferences pane owns activation and package management.
It shows every format, prioritizes repository formats, and uses the same paired
label/dropdown rows as Language engines. Select an uninstalled provider to expose
Install; installed providers expose Update when needed and Uninstall. Installation
activates personal defaults while preserving repository overrides. Formatter choices show provider names, including single-provider formats;
Disabled and Not installed states remain explicit.
The comparison action remains available for formats with alternatives and retains
its on-device measurements. Shared Licenses and notices replaces per-package
license controls; the separate formatter installation pane is removed.

Unconfigured formatters now default to the first listed provider. Language engines
and optional syntax choices follow the same first-provider rule. This selects
packages without downloading them; explicit saved choices and repository overrides
remain authoritative. Missing default-map entries are filled during normalization.
