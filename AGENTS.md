# Code editor project

Build a code editor whose files and Git run in the browser without an application
backend. Reuse Operations' complete repository and interface foundation, adapted
to this product. Call each directory of code a **repository**, including labels,
settings scopes, and domain types.

## Product and architecture

The editor imports repositories into an IndexedDB-backed browser filesystem.
Working files and their ordinary `.git/` share that filesystem. Every document
transaction and file mutation is durably saved in a separate private
editor-history store. Continuous typing/deletion on one row amends the current
private revision and forms one History and Undo/Redo step. End the group on a
1.5-second pause, cursor/selection or file change, paste, formatting, focus loss,
or history navigation. Persist each accepted edit immediately; never debounce
away saves. Undo/redo navigate that history without rewriting normal
repository branches, staging, or commits. A durable application Git timeline
orders those changes together with opening, closing and selecting tabs,
repository/view selection, folder expansion and settings changes. Workspace-only
actions record metadata without creating repository file snapshots. Cursor,
selection, focus and scrolling are restoration context, not independent actions.
Preserve redo across reload and retain divergent futures after undo. Do not
substitute CodeMirror's in-memory history or debounce away intermediate changes.

Application metadata and settings remain separate from source files. Settings use personal
defaults with repository overrides and live CodeMirror reconfiguration. Use the
official CodeMirror packages directly through an owned Svelte component.
Future clones must retain full history, branches, and tags.
A source archive or shallow checkout does not meet that requirement.

Resolve GitHub transport,
authentication, and CORS under the no-backend constraint before clone work; do
not silently introduce a server or proxy. Read the [ADRs](docs/adr/README.md)
and [foundation audit](docs/foundation-parity.md) before architectural changes.

## Foundation and responsibilities

- Use Svelte, strict TypeScript, Vite, Tailwind, shared semantic palettes, local
  fonts, and owned UI primitives. Keep `src/` as the Vite root. Reuse shared
  controls before creating equivalents; preserve accessibility and notices.
- Use short, purposeful transitions for interface state changes, including
  sliding folder expansion/collapse. Respect reduced-motion preferences.
- Keep layout and controls outside CodeMirror borderless, including focused,
  invalid, selected-tab, and inline-rename states. Indicate focus with palette
  fills and text colors; reserve outlines and control frames for the editor.
- `npm run dev` serves `http://127.0.0.1:5175`; `npm run preview` serves
  `http://127.0.0.1:4175`. Both ports are strict. Preserve other applications
  and the stable origin needed for future browser storage.
- Embed JavaScript/CSS/fonts/workers in `dist/index.html`. The distribution also
  contains `_headers`, nine generated favicon files, and 38 opt-in formatter
  packages under `formatters/` and twelve opt-in language-engine packages under
  `languages/`, plus optional syntax packages under `syntax/` and three upstream
  SDK packages under `remotes/`. All language engines start disabled. Provider payloads are installed explicitly into
  IndexedDB and stay outside the core HTML; package notices travel with them.
  Edit the canonical SVG
  in `src/assets`, then run `npm run icons:generate`; build checks freshness.
  The [build guide](build/README.md) owns packaging. Direct `file://` opening is
  an optional packaging check.
- `src/lib/` owns reusable behavior and browser services; `src/dev/` owns
  development-only overlay/toolbar adapters. `?dev-tools=1` enables the toolbar.
- `package.json` and its lockfile own commands/dependencies. Directory READMEs
  own placement rules, ADRs own rationale, and `.github/` owns automation.

## Authority and delivery

Prepare the full Gitflow, release, deployment, reporting, and policy foundation.
Remote mutations require `CODE_AUTOMATION_ENABLED=true` and separately
provisioned branches, permissions, credentials, and deployment resources. The
switch is disabled by default. Do not commit, push, enable remote automation,
or provision services without authorization. Preserve unrelated work.

Keep secrets out of source, bundles, reports, and logs. Preserve AGPL-3.0-only
and Section 7 notices and third-party asset licenses. Follow
[CONTRIBUTING](CONTRIBUTING.md) for contributor and source-notice rules.

## Validation and project guidance

Use the pinned Node/npm versions and `npm ci`. `npm run check` runs the complete
local validation/report/badge contract; see [README](README.md) and the
[test guide](tests/README.md) for prerequisites and targeted commands.
During iterative local development, prioritize fast, focused changes and concise
communication. Use checks proportional to the change; reserve the full suite
and report/badge refresh for broad changes or release readiness.
Every independent test belongs in a named Cucumber scenario. Coverage claims
apply only to `.c8rc.json`'s explicit application-logic scope, not the whole UI.
Keep relevant browser and automation behavior covered as the foundation grows.

Do not create or maintain agent run logs, task/epic ledgers, or TODO bookkeeping
under `.agents/` (including `runs/`, `tasks/`, and `todo/`) unless the developer
explicitly requests that workflow. Existing files, earlier conversation summaries,
and general continuity guidance do not authorize it or activate a disabled skill.
Use only skills enabled in the current session. Keep durable project guidance in
the existing READMEs and ADRs, and report task progress in the conversation.

## Basis and review

The developer requested complete reusable Operations parity, superseding the
earlier narrow scaffold interpretation, then authorized the repository editor,
settings, and Git-backed undo/redo. The audit records the inspected sibling working tree,
adaptations, exclusions, and provisioning boundary. Review guidance when those
contracts or implementation evidence change.
