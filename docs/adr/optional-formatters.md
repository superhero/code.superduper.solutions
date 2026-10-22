# Optional formatter packages

> [!IMPORTANT]
> Install reviewed formatter payloads explicitly into browser-local storage; keep the editor's core HTML independent of them.

## Context

Bundling every formatter made the standalone page approximately 39.5 MB before
HTTP compression. Python support alone contributed a 13 MB Wasm module. Users
should choose which language formatters occupy their browser storage and should
be able to keep using installed providers offline.

## Decision

Ship an embedded trusted catalog and optional static packages generated from
pinned npm dependencies and checksum-pinned upstream Wasm releases. All currently supported dprint and Prettier providers
use this mechanism. Flatten browser JavaScript packages at build time so workers
do not need a remote package resolver or transitive network imports. Keep full
license notices with each package. No formatter or native process runs on a server.

Installations are personal to a browser origin, shared across repositories and
separate from source files, editor preferences and workspace undo history.
Formatting output still enters the existing one-transaction Git history path.
Downloads and offline imports must match the catalog's exact size and SHA-256;
write them atomically only after verification. Installed bytes are verified before
execution. Remove also terminates loaded workers, and other tabs are notified.

Offer updates only when a new application catalog pins a reviewed replacement.
Never discover or install upstream “latest” at runtime. Preserve the previous
installation if a download fails, and require an explicit compatible update before
executing a package that no longer matches the catalog.

## User selection and recommendation

Users choose providers per language with personal defaults and independent
repository overrides. Installation is a resource action and cannot change that
choice. Selection/disable/inherit changes use the application settings history.
The initial routing defaults remain stable across package and measurement updates.

Recommendations prioritize official integrations, then measured browser behavior
among equally supported peers. Comparisons run pure samples in separate workers;
first-use and median warm-request timings are local observations, not CLI-derived
claims or universal rankings. Store them outside repository/workspace history and
invalidate them by package digest. Recommendations never rewrite selection.

## Consequences and status

Implemented for 28 dprint, six Prettier, one Fourmolu and one Dockerfile, one PostgreSQL and one WGSL language-service provider package. The core editor
remains a self-contained HTML artifact; optional formatter files must be served
with it for online installation. Export/import enables offline installation from
matching packages. Shared Prettier code is duplicated between independent packages
to avoid hidden install/remove dependencies. Package size includes its base64
envelope and notices; static-host HTTP compression can reduce transfer sizes.

Jupyter formats notebook cells through explicitly installed language providers,
preserving metadata and outputs without executing code or starting a kernel.
Roslyn’s C# and Visual Basic Wasm wrapper is an optional provider, using the
existing browser adapter without a native process. Native-process providers and
unsupported framework runtimes remain deferred.
This catalog does not authorize arbitrary code or repository-supplied plugins.

The community catalog adds new language support and explicit alternatives to the
existing providers. Both Typstyle adapters are available; archived cmakefmt remains
deferred. Provider config keys come from the Wasm metadata, not package aliases.
Installation metadata uses an IndexedDB index so adding large providers does not
make every application/settings refresh clone all installed payloads. Schema
upgrades preserve installed bytes.

Fourmolu uses its official website Wasm artifact with a browser WASI adapter.
The package includes a separate verified Wasm resource alongside its module
payload, avoiding double base64 encoding. The exact deployed binary and its
Haskell/GHC/WASI notices are pinned together. Only local printer options are
passed; no Cabal process or Haskell toolchain is required.

Dockerfile language-service formatting is an independent opt-in alternative to
recommended dprint formatting. Installation selects the provider for its supported formats in personal settings.
It uses effective editor indentation, runs locally in a worker, and applies edits
through the existing Git-backed document transaction. Registry lookups are disabled;
no dprint or Prettier configuration is read for this provider.

PostgreSQL formatting is an explicit alternative to Lax SQL, whose default remains
unchanged. WGSL formatting uses wgslender. Each formatter installs independently
of its language engine; formatting uses editor indentation and no external config
execution or network access. WAT has no formatter in this pass.

Successful explicit installation also activates the package in personal settings
through application history, preserving repository overrides. Failed or cancelled
downloads do not change selections. This supersedes installation-only behavior.

Formatter preferences now contains the installation/update/uninstall controls in
its format rows, rather than a second package pane. Provider identity is retained
where alternatives exist. No GitHub links or per-provider license/export controls
are added to those rows; the shared notices view reads installed package licenses.
Package import/export UI has been removed. Internal registry import validation
remains available for existing storage and verification paths.
