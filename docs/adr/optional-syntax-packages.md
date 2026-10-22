# Optional syntax packages

> [!IMPORTANT]
> Common syntax support remains included; additional parsers can be explicitly installed and enabled without downloading language engines.

## Context

Syntax highlighting is distinct from formatting and language intelligence.
Bundling every additional parser into the standalone page would charge every user
for languages they do not use. Optional parsers must share the editor's CodeMirror
facets and Lezer tags; bundling duplicate host libraries can break extensions.

## Decision

Keep the official CodeMirror catalog, Svelte, GraphQL, WGSL, stable Handlebars and Makefile
included, with
parser instances activated on demand. Use GraphiQL's syntax-only language support;
completion, diagnostics and other intelligence remain separately opt-in.

Ship HCL/Terraform as a separate, pinned static package. A trusted embedded catalog
specifies its exact version, size and SHA-256. Reuse the package installation and
license controls used by language engines, with a separate IndexedDB database.
Verify bytes before atomic installation and before execution. Support cancellation,
updates, removal, export and offline import. No repository-supplied code or remote
parser discovery is executed.

Installation does not enable highlighting. Personal defaults and repository
overrides explicitly enable it and follow ordinary settings undo/redo. Disabled
or missing optional parsers leave the document editable as plain text; unavailable
selected packages produce an actionable notice. Package changes reconfigure open
editors, including changes from another browser tab.

The optional module exports a factory accepting the host's CodeMirror language and
Lezer modules. Its parser implementation stays outside the core page and has no
runtime imports. The owned loader imports verified code from a newly created Blob;
the standalone build permits this specific import shape from that source module
while continuing to reject external, arbitrary and unowned imports. Shared host
libraries remain included. Markdown fenced HCL uses
the optional parser only when enabled. Installed support works offline.

## Status and consequences

Implemented for HCL, Terraform and Terraform variables. GraphQL and WGSL syntax
are included independently of their optional language engines. Existing C# remains
on the legacy tokenizer; the Replit alternative is excluded. Makefile uses the basic standalone `codemirror-lang-makefile` parser, included
and instantiated on demand. It is intentionally limited to its upstream syntax
coverage; no Acode runtime is used. New syntax providers require compatibility and
license review before entering the trusted catalog.

Stable Handlebars uses the pinned standalone Xiechao parser. The explicitly
approved Gentrace beta is an independently installed alternative, selected through
personal or repository settings. It is not the initial default; installation now
selects it. Missing or removed beta support falls back to stable. The existing
boolean syntax settings map stores this alternative choice without changing old
HCL preferences. Both providers support Markdown fences.

An owned shared adapter supplies Handlebars block folding and indentation;
upstream metadata references a nonexistent Conditional node and Jinja closing
syntax, so it cannot provide these behaviors. The adapter reads parser-recognized
template inserts, ignores comments/raw blocks, caches per state/tree and preserves
HTML behavior. Optional factories receive the shared HTML module as well. No
Acode code or runtime is included.

These providers are syntax highlighters, not complete Handlebars validators.
Stable parsing recovers around advanced partial-block forms; ordinary blocks,
helpers, partials, comments and raw sections have focused coverage. Unsupported
constructs remain editable, but structural folding may be unavailable.

Language selection follows filenames rather than broad personal, repository or
file language-mode overrides. Custom suffix mappings inherit per key from personal
defaults into repository settings, with the longest match taking precedence.
Built-in suffixes and special filename rules remain the baseline. A mapping may
choose an optional parser but never installs or enables its package. Mapping
changes follow settings history and reconfigure syntax, language intelligence and
formatter routing. Old language-mode overrides are discarded during normalization.

Included parser choices default to enabled and can be disabled individually using
personal defaults or repository overrides. These choices share the persisted syntax
settings map with optional package activation. Disabling returns plain text without
loading that parser; Markdown fenced-code discovery excludes disabled languages.
The settings list starts with repository languages, with search and incremental
expansion providing access to the complete catalog. Installation remains separate
from activation and from the Handlebars stable/beta provider choice.

Optional syntax languages and alternative providers appear before installation,
marked Not installed. Selecting one reveals an explicit Install action beside the
dropdown. Installation, updates and uninstall live in those rows; the separate
syntax packages pane is removed. Uninstall preserves selections and exposes Install
again; Handlebars continues to use its stable parser until the beta is installed.
Third-party notices are available in the shared Licenses and notices view.

Successful explicit installation selects the installed syntax provider in personal
settings through application history. Repository overrides remain unchanged.
Failed or cancelled downloads do not change settings. Removal hides the choice
and preserves saved preferences for a later installation.
