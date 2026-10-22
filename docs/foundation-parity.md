# Operations foundation parity

This audit identifies the reusable foundation adopted for the browser editor,
where to review its implementation, and what remains outside local preparation.
It is an index of evidence; the owning code, policy, and ADR control their
respective contracts. Recheck affected rows when those records change.

## Source boundary and adaptation

The reference is the local `../operations.superduper.solutions` working tree,
inspected on 2026-10-13 at HEAD
`48cdde88fce312e0e49df9222d7aaab0616628a6`. The source includes existing local
CI/changelog changes; this is not a claim that every inspected file equals that
commit. Inspection covered reusable root configuration, policy/license records,
`.github`, build/UI/dev/assets, tests/reporting, and related documentation.
Operations was read as a reference and not modified by this adaptation.

The developer's complete-foundation clarification supersedes the earlier
minimal/validation-only interpretation. The initial foundation kept a blank
editor. The subsequent repository editor adds CodeMirror, settings, IndexedDB
storage and separate Git editing history; the root README owns current feature
limits. Prepared external infrastructure still does not imply activation.

### Semantic recheck

A follow-up review on 2026-10-13 compared the clean Operations working tree at
`873d39e9b6e0b6eea92ba03feaaaa47b87c4c32a`; the initial observation above remains
the provenance of the first adaptation. This review compared contributor
commitments, license texts, relevant ADR contracts, source notices, and the
changelog format rather than relying on file presence.

It restored the explicit contribution-license agreement, copyright retention,
and right-to-submit statements, together with the original shared-interface
contrast/palette and bounded-hover contracts. Diagnostic output and test-report
limits were made explicit, and the Staging changelog now retains its end marker.
The first-party license and Code of Conduct remain unchanged from the source;
the Section 7 terms differ only in the project identifier.

The review also found the missing shadcn-svelte MIT notice in the inherited UI
source. The [UI provenance record](../src/lib/components/ui/README.md#provenance-and-licenses)
now preserves the verified official notice and separates derived portions from
project modifications. Its pinned license revision is not an invented original
registry import revision; that original revision remains unknown.

Production and report packaging now retain complete relevant legal texts in
their standalone HTML. The inherited report's separately licensed ApexCharts
asset and graphical panels are omitted; result details and interactive controls
remain. Citation metadata identifies the repository without a fixed release
version, avoiding a stale version outside the release scripts' ownership.

### Favicon organization recheck

On 2026-10-14, the asset organization was rechecked against Operations at HEAD
`402bda81fe6465e5d615334032c64a8128770218`, including its current uncommitted
favicon-generation and asset-guide changes. Both applications keep their
canonical SVG in `src/assets` and use an explicit `?inline` HTML reference.
The shared generator now derives public compatibility files from each app's
own SVG. This review does not replace the earlier foundation provenance.

Code's original function mark replaces its earlier bracket artwork. It uses
new paths inspired by the provided `f_x` reference, with the project copyright
and license; it does not copy Google artwork or font outlines. Operations
retains its workflow-node mark. The [asset guide](../src/assets/README.md)
records the Code source checksum, generated inventory and current primary
Google favicon guidance. The distribution expands from two files to 11 while
runtime code, styles, fonts and workers remain embedded. Publication remains
outside this local change.

Later on 2026-10-14, the developer selected a schema-focused identity for
Operations, superseding the workflow-node artwork described above. Its new
original mark uses three vertically stacked rounded square entities connected
by a spine, with the middle entity linked to a fourth square on the right.
The navy geometry, amber background and rounded tile are retained. Code's
function mark and the shared generation/packaging contract remain unchanged.

## Reusable foundation matrix

| Area | Operations basis | Editor implementation evidence | State / adaptation |
| --- | --- | --- | --- |
| Package and toolchain | Manifest, lockfile, strict TS/Vite | [package.json](../package.json), [lockfile](../package-lock.json), [tsconfig](../tsconfig.json), `.node-version` | Exact relevant versions; editor identity/version 0.0.0. |
| Local development | Vite frontend/HMR | [Vite config](../vite.config.mjs), [README](../README.md) | Dedicated strict ports 5175/4175; stable HTTP origin. |
| Distribution | Inline runtime bundle plus public hosting files | [source entry](../src/index.html), [headers](../src/public/_headers), [build adapters](../build/README.md), [build acceptance](../src/build.feature) | Core 11 files: HTML with application code/CSS/fonts/workers and complete license notices, `_headers`, and nine favicon files; 38 opt-in formatter packages, twelve opt-in language engines and four opt-in type libraries are separate static downloads; no app backend. |
| Favicon organization | Canonical asset SVG, explicit inline link, generated public derivatives | [artwork and output inventory](../src/assets/README.md), [generator](../build/favicons.mjs) | Original Code function mark; shared generation flow with Operations. Hosted ICO/PNG and Apple fallback plus extra compatibility formats; freshness checked before build. |
| Theme and typography | Six-slot palette catalog and semantic roles | [palette](../src/palette.css), [styles](../src/app.css), [font provenance](../src/assets/fonts/README.md) | Original six interface slots extended with six syntax accents per theme, plus four licensed fonts. Four original palette values and shared roles corrected for text/surface contrast; browser scenarios measure both modes, including syntax accents. |
| Shared controls | Owned shadcn/Bits UI | [components config](../components.json), [shared controls](../src/lib/components/README.md) | Base Button, Sheet, tooltip, icon, and class/prop utility foundation; additional feature widgets are deferred below. |
| Startup and diagnostics | Mount boundary, Pail, Visulima adapters | [bootstrap](../src/bootstrap.ts), [logger](../src/lib/logger.ts), [dev adapters](../src/dev/README.md) | Native error detail, cause handling, themed overlay, opt-in toolbar; repository editor mounted. |
| Isolation | COOP/COEP in development and hosting | [Vite config](../vite.config.mjs), [headers](../src/public/_headers) | Headers copied to editor contexts; API support still feature-dependent. |
| Test suite organization | Four Cucumber profiles | [Cucumber config](../cucumber.config.mjs), [test guide](../tests/README.md) | Source, acceptance, automation, browser; no hidden standalone suite. |
| Browser behavior | Playwright and isolated runner | [browser guide](../tests/browser/README.md), [runner](../.github/scripts/test-browser.sh) | Production and dev diagnostics; Docker default, explicit local fallback. |
| Coverage and reports | c8, combined offline reports | [.c8rc.json](../.c8rc.json), [report decision](adr/test-suite-reports.md), [script guide](../.github/scripts/README.md) | 100% explicit production-logic scope; no whole-UI claim. Complete result details and vendor notices; separately licensed charts omitted. |
| Status and badges | Dependency, scenario, coverage generators | [badges](../.github/badges/README.md), [README badges](../README.md#dependency-versions) | Reproducible local outputs from current manifest and test evidence. |
| CI branch routes | Develop/main/release/support/docs workflows | [workflow guide](../.github/workflows/README.md), [automation scenarios](../.github/tests/README.md) | Full adapted routes; validation independent of mutation enablement. |
| Release/history mechanics | Changelog prep, merge, tag, synchronization | [scripts](../.github/scripts/README.md), [changelog](../CHANGELOG.md) | Reusable implementation retained; remote execution disabled by default. |
| Preview/production/report delivery | Pages/R2 helpers and artifact promotion | [deployment decision](adr/continuous-deployment.md), [workflow guide](../.github/workflows/README.md#publication-and-synchronization) | Editor destinations; same validated artifacts, no provisioning performed. |
| Scheduled dependency status | Daily branch inventory/outdated/badge jobs | [schedule guide](../.github/workflows/README.md#scheduled-dependency-checks) | Prepared, disabled until explicit activation. |
| Repository administration | Documentation event-policy input | [policy guide](../.github/policies/README.md) | File prepared; live repository policy not implied. |
| Licensing and community | AGPL, Section 7, conduct, citation | [LICENSE](../LICENSE), [additional terms](../LICENSE-ADDITIONAL-TERMS), [conduct](../CODE_OF_CONDUCT.md), [citation](../CITATION.cff) | AGPL text unchanged; terms only rename project; owner/notices preserved. |
| Architecture and navigation | ADRs and directory READMEs | [decision index](../CONTRIBUTING.md#architectural-decision-records), [docs guide](README.md), [source guide](../src/README.md) | Relevant decisions adapted; implemented/future boundaries explicit. |

## Product-specific exclusions and adopted future contracts

### Palette contrast correction

The original foundation retained contrast gaps from Operations: default primary
text was approximately 3.09:1 and Citrus page text approximately 4.43:1. The
visible editor changes shared text/action/selection roles and adjusts Neon slot
2, Blue Horizon slot 5, and Citrus slots 5/6. Browser scenarios measure semantic
text pairs for every shipped palette in both modes, including hover and disabled
roles. New controls still need their own interaction and contrast verification.

### Feature boundaries

OpenAPI catalogs, operation/schema adapters, workflow graphs, execution/mapping,
Svelte Flow routing, and their product-specific fixtures/styles are excluded:
the editor does not compose API workflows. Their absence does not remove the
shared tooling, presentation, diagnostics, or delivery foundation.

Operations also contains reusable feature-level widgets such as Modal,
Disclosure, Reveal, JSON viewers, and field selectors. These are not all
OpenAPI-specific. They are deferred until an editor interface calls for their
behavior; the repository editor adopts the base primitives and diagnostic controls. Review those existing widgets before implementing
equivalent feature controls, and bring their styles and behavioral tests with
any future adaptation.

Repository storage/Git, the inline worker, and settings persistence now have
editor-specific implementations. Operations workflow undo/redo semantics were
explicitly requested by the developer: private Git history records each editing
change, while ordinary source repository commits stay independent. Their stores
use repository-specific namespaces rather than sharing Operations databases.

Manual formatting uses a separate embedded worker with opt-in dprint/Prettier packages and the same
Git-backed edit path. Its [provider and configuration contract](../src/lib/formatting/README.md)
keeps execution local and excludes native processes, arbitrary plugins and
language-server services. Reviewed provider packages are explicitly installed
from static assets, verified against the embedded catalog and stored in IndexedDB. Accepted output is one transaction; stale output is ignored.

Directory imports retain supplied files and complete supplied `.git/` histories.
Submodule folders whose `.git` file points elsewhere request a second directory
selection for their complete Git metadata, then import as standalone repositories.
Local Git staging/review, commits, branch integration, linear history rewriting,
conflict sessions and stash now use the owned browser worker and journal; they
add no application backend. Optional GitHub/GitLab/Bitbucket clients and remote
Git now extend that foundation, with complete HTTPS clones and explicit direct
or user-configured trusted-relay transport. No relay is provisioned or silently
selected. Account permissions and deployed CORS remain user configuration; live
remote writes are excluded from implementation tests. The [upstream guide](../src/lib/remotes/README.md)
owns the supported workflows and limitations. Repository export remains future work.

On 2026-10-19 the browser monitoring panel was revisited in Operations' local
working tree at HEAD `09eb5c093972fd45e2740bb8a02e831cd6a66e29` (including its local
changes). `settings/StorageSettings.svelte`, `storage-metrics.ts`,
`processing-metrics.ts`, `page-memory.ts` and the history chart informed the
editor's **Resources** view. Source notices remain in adapted files. This adds
live session charts, optional memory observations, storage estimates, read-only
database counts and already-loaded repository counts. The editor uses its own
bounded visible-view lifecycle; Operations' always-on recorder, workflow models,
metric databases, persisted candle history and retention semantics were not
copied. See the [resource decision](adr/resource-monitoring.md) and
[module guide](../src/lib/resources/README.md). The Operations tree was not modified.

## External provisioning and activation

Local preparation does not create or verify the remote repository's branches,
protections, required checks, GitHub App installation/permissions/secrets, or
scoped documentation event policy. It does not create Cloudflare resources:
Pages project `code-superduper-solutions`, R2 bucket `code-status`, or report
hosting at `status.code.superduper.solutions`.

The [activation guide](../.github/workflows/README.md#activation-and-local-development)
owns these prerequisites and credential names. Remote mutation jobs require
`CODE_AUTOMATION_ENABLED` to equal `true`; the default is disabled. Provisioning,
activation, and actual publication remain separately authorized operations.

## Verification and maintenance

Use `npm run check` for types, all four suites, scoped coverage, build,
reports, and badge consistency. The build includes a byte-for-byte favicon
freshness check against the canonical SVG. Automation scenarios validate branch/release
and activation behavior with simulated remote APIs and disposable repositories.
Browser scenarios verify production mounting/assets and development diagnostics.
A successful local check does not prove deployed permissions or credentials.

Refresh this audit when reusable reference contracts change, a product feature
is implemented, or remote infrastructure is actually provisioned. Record those
new facts in their owning guides instead of treating preparation as activation.

Optional syntax support now reuses the verified package registry and interface
controls used by language engines, with separate storage and settings activation.
HCL/Terraform and the Handlebars beta stay outside the core HTML; GraphQL, WGSL
and stable Handlebars syntax are included.
The [syntax package decision](adr/optional-syntax-packages.md) owns this boundary.
