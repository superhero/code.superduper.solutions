# Optional browser language engines

> [!IMPORTANT]
> Language intelligence is explicitly installed and activated; analysis runs in local workers without a backend.

## Context

Syntax parsers and formatters do not provide repository-aware type checking or
hover documentation. Different language engines have different dependencies,
capabilities and memory costs. A browser-compatible service library is sufficient;
a native language-server process is not required or permitted by this product.

## Decision

Ship twelve reviewed, self-contained worker packages with an embedded trusted
catalog. Pin their source dependencies; retain full application and dependency
notices inside each package. Keep engine payloads outside the core HTML. Verify
size and SHA-256 before atomic IndexedDB installation and again before execution.
Support explicit updates, removal, export and offline import. Do not resolve or
execute arbitrary repository plugins or download upstream latest versions.

All language choices begin disabled. Installation is an origin-local resource
operation, independent of activation and application history. Activation and
per-language disabling use personal defaults with repository overrides, including
the existing settings undo/redo path. Do not silently activate a provider when
it is installed. Missing or incompatible packages remain unavailable.

An owned CodeMirror extension requests completion, diagnostics and hover from
workers. Workers receive read-only source snapshots plus the current unsaved
buffer. Discard stale responses and terminate sessions when disabled, replaced,
removed, hidden or idle. Analysis creates no source edits or history revisions;
accepting a completion uses the normal editor transaction and Git history path.

Read schemas and dependencies only from repository files and packaged libraries.
Do not execute configuration, install dependencies, or contact external schema
registries. Standard JavaScript declarations travel with TypeScript. Browser/DOM,
Web Worker, Node/Undici and ScriptHost declarations are separately verified data
packages, offered in Settings only after installing the current TypeScript engine.
They require explicit installation and activation, with personal defaults and
repository overrides. Enable Node globals through that opt-in rather than environment
guessing; respect explicit compiler `types` and `lib`, including empty lists.
Only enabled, installed declarations enter worker initialization, once per session;
they are never executed or fetched during analysis. Repository declarations take
priority over packaged fallbacks. Package removal retains preference choices.
The developer additionally authorized a curated community-type shortlist and npm
search. Explicit declaration installation may resolve versions from the public
npm registry, verify archive integrity and preserve exact dependency provenance.
This resource operation runs in an owned installer worker, separate from analysis.
Only declarations, package metadata and notices enter browser storage; no npm
runtime code, scripts, repository dependencies or plugins are executed or installed.
Keep graph/download/extraction limits, reject unsafe paths and preserve notices.
Declaration dependencies are private to each installed root. Search is explicit
and bounded; analysis remains offline and cannot fetch missing types.
Store npm payloads separately from lightweight installation metadata, retain scoped
activation and support validated data-only offline export/import. Unlike the static
trusted catalog, these installs trust the user-selected public npm release and its
registry integrity metadata; local data imports do not prove registry provenance.
Render hover Markdown with raw HTML disabled and remote images suppressed, so
source-derived documentation cannot execute HTML or fetch embedded assets.

## Status and consequences

Implemented for TypeScript/JavaScript, HTML, CSS/SCSS/Less, JSON/JSONC, YAML,
Markdown, GraphQL, Dockerfile, PostgreSQL SQL, TOML and WGSL. HTML provides completion and hover; other engines also
provide diagnostics appropriate to their language. Feature availability is
shown in Settings. Cross-file navigation, references, rename, code actions,
semantic-token coloring and framework-specific services remain future work.

Python is explicitly excluded from this pass: the available browser adaptations
require an experimental integration, which the developer declined. Existing
Python syntax highlighting and optional formatting remain available.

TypeScript reads local compiler options but does not resolve inherited tsconfig
files or discover installed package types over the network. Schema-driven
JSON/YAML intelligence needs local schema references. GraphQL uses a local root
schema.graphql for schema intelligence. These boundaries preserve offline use and
prevent hidden servers or network dependencies.

Dockerfile intelligence uses pinned `dockerfile-language-service` in an optional
local worker for completion, diagnostics and hover. Docker Hub tag requests are
disabled through an owned offline registry adapter; instruction, stage and variable
completion remain local. The build guards the replaced upstream implementation
by version and digest. Navigation and rename are not wired into the editor yet.

PostgreSQL, Taplo (TOML) and wgslender (WGSL) run in optional local workers.
Binary resources are base64 fields in the same checksum-verified package envelope,
passed to the worker before requests. They are never fetched from CDNs. Browser
adaptations remove Node-only loading branches and are guarded by source digests.
Taplo's environment exposes read-only repository files and local schema reads;
external catalogs and automatic config discovery are disabled. PostgreSQL accepts
an optional root `postgres-schema.json` in upstream SchemaCache format; this is
metadata, not a database connection or SQL execution. SQL activation explicitly
selects PostgreSQL semantics. Other new workers reject fetch entirely.

The experimental community Svelte adaptation and threaded WASI shader-sense are
excluded. Existing JavaScript/TypeScript support remains unchanged. No additional
navigation, rename or signature-help UI is claimed by these adapters.

WAT is deferred: published `@emnudge/wat-lsp@0.10.0` initializes with an embedded
highlight query referencing an unsupported `identifier_pattern` node. No WAT
engine is shipped until an upstream package passes clean browser initialization.

Shopify Liquid uses the official browser server over an internal MessageChannel,
adapted to the same completion, diagnostics and hover protocol. All JSON-RPC and
LSP imports in that package resolve to the server's compatible browser versions;
mixing protocol versions can otherwise fail at runtime. A read-only filesystem
adapter exposes repository snapshots, tracks file-change notifications and treats
the repository as a default theme root using non-persisted host metadata.

Shopify documentation, system translations and theme/app schema definitions come
from a checksum-pinned `Shopify/theme-liquid-docs` revision and ship inside the
optional package, with the upstream notice. Schema identifiers remain upstream
URIs, but resolution uses bundled definitions only. Worker fetch is denied. Custom
or remote Theme Check profiles cannot execute; only built-in profiles and local
configuration are supported. No store connection, account or API is required.

Liquid's remote asset-size helper is replaced by an owned offline adapter;
otherwise its fetch ponyfill could make XMLHttpRequest calls independently of
global fetch. These remote-size checks are unavailable locally. Files requiring
a Liquid template URI (including asset templates and manual-language overrides)
use a private in-memory alias; no alias or root marker is written to source.

Analysis requests include a separate read-only path list in addition to text
snapshots. Liquid uses it for file/directory existence (including binary assets),
without passing binary contents to analysis or reading them as text. Unknown
binary sizes do not claim remote or full binary performance validation. Liquid,
TOML configuration and SVG text dependencies join the bounded workspace snapshot.

Successful explicit installation also activates the package in personal settings
through application history, preserving repository overrides. Failed or cancelled
downloads do not change selections. This supersedes installation-only behavior.
