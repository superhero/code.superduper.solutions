# code.superduper.solutions

A browser-local code editor built with Svelte and the official CodeMirror 6
packages, using the Operations repository and interface foundation. Create a
repository or import a directory, edit its files, and configure the editor in
Settings. Files, preferences, and Git remain in this browser's IndexedDB.

Each editing transaction saves immediately in private Git history; continuous
typing on one row forms one History and Undo/Redo step. Each repository has file-only undo/redo, while Global, Repository, and File
settings have independent histories. History survives reopening without replaying
tab or viewport navigation. Ordinary source commits remain explicit and independent.
No application backend is required.

The AI pane uses Pi's browser agent harness for local Ollama conversations and
[installable browser models](src/lib/assistant/browser/README.md): Bonsai 2
2B/4B/9B/27B on WebML and Ornith 1.5 9B Q4/Q8 on pinned Wllama/llama.cpp.
AI → Connections → Browser models installs weights explicitly on this device;
opening the pane does not download them.
Settings → AI configures system instructions and read-only repository tools;
the model row shows context usage and remembers each model's context budget.
Tool calls and results are visible in the conversation. Saved OpenAI connections
use the encrypted vault and remain text-only in this first tool-enabled slice.

[![Scenarios](.github/badges/test-scenarios.svg)](.github/badges/test-scenarios.json)
[![Scoped coverage](.github/badges/test-coverage.svg)](.github/badges/test-coverage.json)

## Development status

[![Main CI/CD](https://img.shields.io/github/actions/workflow/status/superhero/code.superduper.solutions/ci-main.yml?label=Main%20CI%2FCD)](https://github.com/superhero/code.superduper.solutions/actions/workflows/ci-main.yml)
[![Develop CI](https://img.shields.io/github/actions/workflow/status/superhero/code.superduper.solutions/ci-develop.yml?label=Develop%20CI)](https://github.com/superhero/code.superduper.solutions/actions/workflows/ci-develop.yml)

These badges report GitHub workflow runs when available; local checks do not
populate their status. Main handles release validation and prepared publication;
Develop validates integration changes. Publication and merges remain disabled
until the [activation prerequisites](.github/workflows/README.md#activation-and-local-development)
are met and `CODE_AUTOMATION_ENABLED=true` is explicitly set.

The scenario and coverage badges above are generated from local test evidence.
Their links expose that badge metadata; the full reports are generated at
`tmp/test-report.html` and `tmp/test-coverage.html`. Remote report hosting has
not been provisioned.

## Local development

Use Node.js **26.7.0** and npm **11.19.0**, pinned to the Operations toolchain.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5175**. This project has its own strict development
port; a collision fails rather than changing its origin. Vite serves the
frontend and hot updates. Add
`?dev-tools=1` for the developer toolbar; the themed error overlay operates
independently.

```sh
npm run build
npm run preview
```

Preview opens at **http://127.0.0.1:4175**, also strict. The core build contains
11 files: `dist/index.html`, embedding application code, CSS, local fonts and the
worker; `dist/_headers` for static-host isolation headers; and nine generated
[favicon files](src/assets/README.md#favicon-outputs). The original function mark
uses inline SVG with hosted ICO/PNG fallbacks and an Apple touch icon. Direct
opening of the HTML is an optional packaging check; HTTP is the standard
development workflow. The build also emits 38 optional formatter packages under
`dist/formatters/` and twelve optional language-engine packages under
`dist/languages/`, plus optional HCL/Terraform and Handlebars beta syntax packages under
`dist/syntax/`, four type-library data packages under `dist/types/`, and three
upstream SDK packages under `dist/remotes/`, downloaded only when installed from Settings.

The HTML also embeds complete project, font, vendored UI, and bundled dependency
notices in an inert `license-notices` template, inspectable in page source.
The [build packager](build/license-notices.mjs) uses Vite's bundled-package
inventory and fails when required notice text is missing.

The frontend server is not a files/Git backend. Repository content lives in
the browser. Keep the same scheme, host, and port for a stable storage origin;
development and preview have separate IndexedDB storage.

## Using the editor

- **Repositories:** create an empty repository or import a directory. The directory
  picker imports the files it supplies; if it supplies a complete `.git/`, ordinary
  Git history and refs are retained. For a submodule with a `.git` file, the editor
  asks you to select the Git directory that file points to, then imports it as a
  standalone browser repository. Relative paths start from the uploaded folder;
  enable hidden folders in the picker if needed. Without any `.git` entry, the
  import starts a new Git repository.
- **Editing:** a new import leaves files closed until you select one. Returning
  to a repository restores its tabs and active file. Reloading also restores the
  selected repository, page, cursor/selection, scrolling and expanded folders.
  Expand folders in the file tree to browse
  their contents; arrow keys move focus, and Enter or Space opens the focused file.
  Create, rename, and delete files as needed. Every accepted edit saves immediately,
  including ignored files. Continuous typing/deletion on one row shares a private
  history revision until you pause for 1.5 seconds, move the cursor, change files,
  paste, format, leave the editor, or use Undo/Redo.
  Binary/non-UTF-8 bytes are retained but cannot be edited as text.
- **History:** Undo/Redo in the editor restore only the active repository's files,
  keeping tabs, split panes and the selected view in place. Settings Undo/Redo
  affect only the selected Global, Repository, or File settings scope. Navigation
  does not become an undo step or clear another scope's redo. Cursor and selection
  remain restoration context for file changes. Histories and redo survive reload;
  editing within a scope after Undo retains its old future in private Git refs. Selecting a `Staged changes` graph entry restores that revision as an undoable
  action. Each source commit has its own saved `Staged changes` graph: new commits start
  empty, and returning to a commit restores its previous graph. Checkout restores
  committed files; select a saved change to reapply it. Repository Undo/Redo remains
  continuous across commits. Normal source branches, staging, and existing
  commits stay separate.
- **Local Git:** the editor's Commit button and both History views open the same
  review panel. Stage or unstage files and hunks, inspect staged/unstaged diffs,
  enter a message and identity, and commit the exact index while later working
  edits stay intact. Commit history selects an inspection panel; checkout is an
  explicit action. The panel also supports amend/reword, merge (including
  fast-forward and squash merge), linear rebase, squash through the branch tip,
  cherry-pick, revert, soft/mixed/hard reset, tags, branch rename/delete, and
  stash push/apply/pop/drop with optional untracked files. Conflicts have an
  editable result and explicit resolution, Continue, Skip (rebase), and Abort.
  In-progress operations survive reload. History rewrites retain recovery refs.
  Toolbar visibility and optional keybindings control entry points.
- **Upstreams:** install GitHub (Octokit), GitLab (GitBeaker) and Bitbucket Cloud
  (Bitbucket.js) in Settings, with personal token connections and optional
  passphrase-encrypted storage. Clone full repositories, browse accounts, create
  repositories/forks, fetch, track branches, pull with merge/rebase, and review
  branch/tag pushes or deletions in the Git pane's Remotes tab. Hosted requests,
  issues and checks share the same connection. GitHub Git transport requires an
  explicitly configured trusted CORS relay; no relay or backend is silently added.
  See [setup and transport requirements](src/lib/remotes/README.md).
- **Branches:** the sidebar root lists local branches and offers New branch.
  Creation selects a branch from the current commit and keeps working changes.
  Switching requires clean tracked files and staging; untracked files are kept
  unless they conflict with the target. New repositories need an initial commit
  before creating another branch.
- **Resources:** live browser memory, origin storage/quota, persistence and
  main-thread blocking measurements, with a bounded chart and read-only database
  record counts. Page memory is measured on request where supported. Monitoring
  pauses outside the view or when the page is hidden; samples are not persisted
  or sent anywhere. Unsupported values stay unavailable.
- **Settings:** personal defaults, repository overrides, and selected-file overrides
  apply live. Theme, typography, indentation, wrapping, gutters, editing aids,
  completion and filename-to-language suffix mappings are configurable.
  Syntax highlighting supports 148 included local language modes, automatic filename
  detection, personal/repository suffix mappings, and fenced code in Markdown. Handlebars uses the
  stable parser by default, with a separately installed Gentrace beta alternative. Each theme has twelve
  color slots: six interface colors and six syntax accents with light/dark variants.
  Common `.editorconfig` glob sections, nested roots and `unset` apply indentation
  and tab width between repository settings and explicit file overrides. Other
  EditorConfig properties do not automatically transform imported files. File
  overrides belong to their paths; renaming a file does not move its overrides.

Keyboard Undo/Redo and the toolbar use the same application history. Tab normally
indents code; press Escape then Tab to leave the editor. Settings can instead make
Tab move keyboard focus.
Use the **Format document** icon in the second header for manual local formatting.
Install the desired providers in **Settings → Global defaults → Formatters**.
Packages are stored in IndexedDB and work offline after installation; Settings
also provides explicit updates, removal, export/import and license notices.
Choose the formatter per language in **Formatter preferences**, with personal
defaults and repository overrides. Installation never changes this selection.
Recommendations prefer official integrations, with optional on-device comparisons
showing first-use and subsequent formatting times. Comparisons never edit files.
dprint and Prettier run locally in an embedded worker, following the documented
[language mapping and configuration rules](src/lib/formatting/README.md).
Formatting is one undoable change; autosave and Ctrl+S do not format.

**Language engines** are separately opt-in. Install reviewed packages in
**Settings → Global defaults → Language engine packages**, then activate each
language under **Language engines**, personally or for one repository. All start
disabled. Twelve local worker packages support JavaScript/TypeScript, HTML,
CSS/SCSS/Less, JSON/JSONC, YAML, Markdown, GraphQL, Dockerfile, PostgreSQL SQL, TOML, WGSL and Shopify Liquid, providing completion,
hover and diagnostics where supported. Installed packages work offline and support
export/import, updates, removal and full license notices. Dependencies and schemas
are read locally; nothing is fetched automatically. Python engines are excluded
from this pass. See [capabilities and limits](src/lib/intelligence/README.md).

Git and filesystem operations run in an embedded worker. Saves are acknowledged
only after durable writes; interrupted journaled operations recover on reopening.
Conflicting writes from another tab are rejected while keeping the visible text
available to download. Wait for **All changes saved** before leaving the page.
Browser storage still depends on the browser's quota and eviction policies.

Remote Git uses complete HTTPS clones with all advertised branches, tags and
reachable history. Direct transport requires the host to allow browser Git CORS;
otherwise configure a trusted relay in the connection. Account credentials and
deployed CORS/relay permissions need user configuration. Real upstream writes are
not exercised by the implementation tests. SSH, LFS object transfers and Bitbucket
Data Center are not included. Repository export remains future work.

See the [history decision](docs/adr/editor-history.md) and
[repository service guide](src/lib/repository/README.md) for the storage contract.

## Validation and commands

Bash, Git, and jq are required for automation checks. Browser tests normally
use Docker and the Playwright image matching the pinned package. The
[test guide](tests/README.md) documents its explicit local-browser alternative
and diagnostic output.

```sh
npm run check
```

This performs type checking, all four Cucumber profiles, scoped coverage,
production build, combined reports, and generated-badge consistency checks.
Reports open offline from `tmp/test-report.html` and `tmp/test-coverage.html`.
Both retain full license notices in their page source. The test report keeps
result tables, filtering, attachments and navigation; its optional graphical
charts are omitted. See the [report asset inventory](.github/licenses/README.md).
Coverage is 100% of the explicitly scoped Node-executable application logic;
it is not a whole-interface coverage claim.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact locked dependencies. |
| `npm run dev` / `npm run preview` | Serve development / the built artifact. |
| `npm run typecheck` / `npm run build` | Check Svelte/TypeScript / check favicon freshness and package production assets. |
| `npm run icons:generate` / `npm run icons:check` | Regenerate favicon derivatives / verify they match the canonical SVG without writing. |
| `npm test` | Source with coverage, coverage gate, build, acceptance, automation, and browser suites. |
| `npm run test:source` | Cucumber application-source behavior. |
| `npm run test:source:coverage` | Source scenarios with c8 collection. |
| `npm run test:coverage` | Report and enforce scoped coverage from fresh collection. |
| `npm run test:acceptance` | Built-artifact acceptance; build first. |
| `npm run test:acceptance:coverage` | Acceptance with c8 collection. |
| `npm run test:automation` | Repository workflow and helper behavior. |
| `npm run test:browser` | Cucumber scenarios driven by Playwright; build first. |
| `npm run report:tests` | Combine fresh results from all four profiles. |
| `npm run report:coverage` | Package the fresh coverage report as standalone HTML. |
| `npm run badges:dependencies` | Regenerate dependency-version badges. |
| `npm run badges:scenarios` | Regenerate badges from all four scenario reports. |
| `npm run badges:coverage` | Regenerate the scoped-coverage badge. |
| `npm run check` | Run the complete local validation and report/badge contract. |

Regenerate affected badges after source/dependency/test changes, then check
that they match the final evidence. Filtered or stale suite output does not
establish complete reporting. See the [automation guide](.github/workflows/README.md)
for the full command ordering and release procedures.

## Repository foundation

- [Application source](src/README.md): Svelte composition, strict TypeScript,
  semantic themes, owned Button/Sheet primitives, and licensed local fonts.
- [Build adapters](build/README.md): generated favicon compatibility files,
  inline runtime assets, and preserved license notices.
- [Development adapters](src/dev/README.md): Pail diagnostics, Visulima cause
  navigation, themed overlay, and opt-in performance/timeline toolbar.
- [Tests](tests/README.md): source, acceptance, automation, and browser profiles,
  combined Cucumber reports, Playwright, and c8.
- [Repository automation](.github/DIRECTORY.md): Gitflow branch policy,
  changelog/release preparation, merges, previews, artifact promotion, report
  publication, synchronization, and scheduled dependency status.
- [Architectural decisions](CONTRIBUTING.md#architectural-decision-records)
  and [foundation audit](docs/foundation-parity.md): adapted contracts, source
  evidence, product exclusions, and external provisioning still required.

The complete automation is prepared locally. Remote mutation is **disabled
unless `CODE_AUTOMATION_ENABLED` equals `true`**. GitHub App permissions,
protected branches, secrets, Cloudflare resources, and domains still require
separate provisioning and authorization. No release, deployment, or remote
configuration is implied by these files; this work remains local without a push.

## Editor architecture

Each repository has a directory in the IndexedDB-backed LightningFS filesystem
containing its working tree and ordinary `.git/` history. A separate private Git
directory records editing changes. A separate application Git timeline orders
workspace/settings snapshots and references the exact repository revisions for
file changes. Workspace-only actions do not create repository file snapshots.
The worker runs isomorphic-git locally; metadata and editor settings stay separate
from source files and ordinary commits.

Cloning preserves **full history, branches, and tags**. A ZIP archive, shallow
clone or single-branch shortcut does not satisfy that contract. The explicit
direct/relay transport and credential boundary are documented in the
[upstream decision](docs/adr/upstream-integrations.md).

## Dependency versions

These badges show the exact versions declared in this revision. Registry status
refresh is a separate scheduled automation operation, disabled by default.

<a href="https://www.npmjs.com/package/@octokit/rest"><img src=".github/badges/version-dependency-octokit--rest.svg" alt="@octokit/rest declared version"></a>
<a href="https://www.npmjs.com/package/@gitbeaker/rest"><img src=".github/badges/version-dependency-gitbeaker--rest.svg" alt="@gitbeaker/rest declared version"></a>
<a href="https://www.npmjs.com/package/bitbucket"><img src=".github/badges/version-dependency-bitbucket.svg" alt="bitbucket declared version"></a>

<a href="https://www.npmjs.com/package/@cucumber/cucumber"><img src=".github/badges/version-dependency-cucumber--cucumber.svg" alt="@cucumber/cucumber declared version"></a>
<a href="https://www.npmjs.com/package/@playwright/test"><img src=".github/badges/version-dependency-playwright--test.svg" alt="@playwright/test declared version"></a>
<a href="https://www.npmjs.com/package/@sveltejs/vite-plugin-svelte"><img src=".github/badges/version-dependency-sveltejs--vite-plugin-svelte.svg" alt="@sveltejs/vite-plugin-svelte declared version"></a>
<a href="https://www.npmjs.com/package/@tailwindcss/vite"><img src=".github/badges/version-dependency-tailwindcss--vite.svg" alt="@tailwindcss/vite declared version"></a>
<a href="https://www.npmjs.com/package/@visulima/dev-toolbar"><img src=".github/badges/version-dependency-visulima--dev-toolbar.svg" alt="@visulima/dev-toolbar declared version"></a>
<a href="https://www.npmjs.com/package/@visulima/inspector"><img src=".github/badges/version-dependency-visulima--inspector.svg" alt="@visulima/inspector declared version"></a>
<a href="https://www.npmjs.com/package/@visulima/pail"><img src=".github/badges/version-dependency-visulima--pail.svg" alt="@visulima/pail declared version"></a>
<a href="https://www.npmjs.com/package/@visulima/vite-overlay"><img src=".github/badges/version-dependency-visulima--vite-overlay.svg" alt="@visulima/vite-overlay declared version"></a>
<a href="https://www.npmjs.com/package/bits-ui"><img src=".github/badges/version-dependency-bits-ui.svg" alt="bits-ui declared version"></a>
<a href="https://www.npmjs.com/package/c8"><img src=".github/badges/version-dependency-c8.svg" alt="c8 declared version"></a>
<a href="https://www.npmjs.com/package/cn"><img src=".github/badges/version-dependency-cn.svg" alt="cn declared version"></a>
<a href="https://www.npmjs.com/package/multiple-cucumber-html-reporter"><img src=".github/badges/version-dependency-multiple-cucumber-html-reporter.svg" alt="multiple-cucumber-html-reporter declared version"></a>
<a href="https://www.npmjs.com/package/rolldown"><img src=".github/badges/version-dependency-rolldown.svg" alt="rolldown declared version"></a>
<a href="https://www.npmjs.com/package/sharp"><img src=".github/badges/version-dependency-sharp.svg" alt="sharp declared version"></a>
<a href="https://www.npmjs.com/package/svelte"><img src=".github/badges/version-dependency-svelte.svg" alt="svelte declared version"></a>
<a href="https://www.npmjs.com/package/svelte-check"><img src=".github/badges/version-dependency-svelte-check.svg" alt="svelte-check declared version"></a>
<a href="https://www.npmjs.com/package/tailwind-variants"><img src=".github/badges/version-dependency-tailwind-variants.svg" alt="tailwind-variants declared version"></a>
<a href="https://www.npmjs.com/package/tailwindcss"><img src=".github/badges/version-dependency-tailwindcss.svg" alt="tailwindcss declared version"></a>
<a href="https://www.npmjs.com/package/tw-animate-css"><img src=".github/badges/version-dependency-tw-animate-css.svg" alt="tw-animate-css declared version"></a>
<a href="https://www.npmjs.com/package/typescript"><img src=".github/badges/version-dependency-typescript.svg" alt="typescript declared version"></a>

TypeScript 6 remains pinned with the Operations toolchain. Before a TypeScript 7
upgrade, review the [Svelte language-tools compatibility issue](https://github.com/sveltejs/language-tools/issues/3063).

[![TypeScript 7 compatibility issue](https://img.shields.io/github/issues/detail/state/sveltejs/language-tools/3063?label=upstream%20issue%20%233063)](https://github.com/sveltejs/language-tools/issues/3063)

<a href="https://www.npmjs.com/package/vite"><img src=".github/badges/version-dependency-vite.svg" alt="vite declared version"></a>
<a href="https://www.npmjs.com/package/vite-plugin-singlefile"><img src=".github/badges/version-dependency-vite-plugin-singlefile.svg" alt="vite-plugin-singlefile declared version"></a>
<a href="https://www.npmjs.com/package/yaml"><img src=".github/badges/version-dependency-yaml.svg" alt="yaml declared version"></a>

<a href="https://www.npmjs.com/package/@codemirror/autocomplete"><img src=".github/badges/version-dependency-codemirror--autocomplete.svg" alt="@codemirror/autocomplete declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/commands"><img src=".github/badges/version-dependency-codemirror--commands.svg" alt="@codemirror/commands declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/lang-css"><img src=".github/badges/version-dependency-codemirror--lang-css.svg" alt="@codemirror/lang-css declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/lang-html"><img src=".github/badges/version-dependency-codemirror--lang-html.svg" alt="@codemirror/lang-html declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/lang-javascript"><img src=".github/badges/version-dependency-codemirror--lang-javascript.svg" alt="@codemirror/lang-javascript declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/lang-json"><img src=".github/badges/version-dependency-codemirror--lang-json.svg" alt="@codemirror/lang-json declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/lang-markdown"><img src=".github/badges/version-dependency-codemirror--lang-markdown.svg" alt="@codemirror/lang-markdown declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/language"><img src=".github/badges/version-dependency-codemirror--language.svg" alt="@codemirror/language declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/language-data"><img src=".github/badges/version-dependency-codemirror--language-data.svg" alt="@codemirror/language-data declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/search"><img src=".github/badges/version-dependency-codemirror--search.svg" alt="@codemirror/search declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/state"><img src=".github/badges/version-dependency-codemirror--state.svg" alt="@codemirror/state declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/view"><img src=".github/badges/version-dependency-codemirror--view.svg" alt="@codemirror/view declared version"></a>
<a href="https://www.npmjs.com/package/@isomorphic-git/lightning-fs"><img src=".github/badges/version-dependency-isomorphic-git--lightning-fs.svg" alt="@isomorphic-git/lightning-fs declared version"></a>
<a href="https://www.npmjs.com/package/@lezer/highlight"><img src=".github/badges/version-dependency-lezer--highlight.svg" alt="@lezer/highlight declared version"></a>
<a href="https://www.npmjs.com/package/@lezer/javascript"><img src=".github/badges/version-dependency-lezer--javascript.svg" alt="@lezer/javascript declared version"></a>
<a href="https://www.npmjs.com/package/@replit/codemirror-lang-svelte"><img src=".github/badges/version-dependency-replit--codemirror-lang-svelte.svg" alt="@replit/codemirror-lang-svelte declared version"></a>
<a href="https://www.npmjs.com/package/buffer"><img src=".github/badges/version-dependency-buffer.svg" alt="buffer declared version"></a>
<a href="https://www.npmjs.com/package/idb"><img src=".github/badges/version-dependency-idb.svg" alt="idb declared version"></a>
<a href="https://www.npmjs.com/package/isomorphic-git"><img src=".github/badges/version-dependency-isomorphic-git.svg" alt="isomorphic-git declared version"></a>
<a href="https://www.npmjs.com/package/@lezer/markdown"><img src=".github/badges/version-dependency-lezer--markdown.svg" alt="@lezer/markdown declared version"></a>
<a href="https://www.npmjs.com/package/@mathjax/mathjax-tex-font"><img src=".github/badges/version-dependency-mathjax--mathjax-tex-font.svg" alt="@mathjax/mathjax-tex-font declared version"></a>
<a href="https://www.npmjs.com/package/@mathjax/src"><img src=".github/badges/version-dependency-mathjax--src.svg" alt="@mathjax/src declared version"></a>
<a href="https://www.npmjs.com/package/markdown-it"><img src=".github/badges/version-dependency-markdown-it.svg" alt="markdown-it declared version"></a>
<a href="https://www.npmjs.com/package/@earendil-works/pi-agent-core"><img src=".github/badges/version-dependency-earendil-works--pi-agent-core.svg" alt="@earendil-works/pi-agent-core declared version"></a>
<a href="https://www.npmjs.com/package/@earendil-works/pi-ai"><img src=".github/badges/version-dependency-earendil-works--pi-ai.svg" alt="@earendil-works/pi-ai declared version"></a>
<a href="https://www.npmjs.com/package/typebox"><img src=".github/badges/version-dependency-typebox.svg" alt="typebox declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-abbr"><img src=".github/badges/version-dependency-mdit--plugin-abbr.svg" alt="@mdit/plugin-abbr declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-advanced-links"><img src=".github/badges/version-dependency-mdit--plugin-advanced-links.svg" alt="@mdit/plugin-advanced-links declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-alert"><img src=".github/badges/version-dependency-mdit--plugin-alert.svg" alt="@mdit/plugin-alert declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-align"><img src=".github/badges/version-dependency-mdit--plugin-align.svg" alt="@mdit/plugin-align declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-anchor"><img src=".github/badges/version-dependency-mdit--plugin-anchor.svg" alt="@mdit/plugin-anchor declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-attrs"><img src=".github/badges/version-dependency-mdit--plugin-attrs.svg" alt="@mdit/plugin-attrs declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-container"><img src=".github/badges/version-dependency-mdit--plugin-container.svg" alt="@mdit/plugin-container declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-demo"><img src=".github/badges/version-dependency-mdit--plugin-demo.svg" alt="@mdit/plugin-demo declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-dl"><img src=".github/badges/version-dependency-mdit--plugin-dl.svg" alt="@mdit/plugin-dl declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-embed"><img src=".github/badges/version-dependency-mdit--plugin-embed.svg" alt="@mdit/plugin-embed declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-emoji"><img src=".github/badges/version-dependency-mdit--plugin-emoji.svg" alt="@mdit/plugin-emoji declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-field"><img src=".github/badges/version-dependency-mdit--plugin-field.svg" alt="@mdit/plugin-field declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-figure"><img src=".github/badges/version-dependency-mdit--plugin-figure.svg" alt="@mdit/plugin-figure declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-footnote"><img src=".github/badges/version-dependency-mdit--plugin-footnote.svg" alt="@mdit/plugin-footnote declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-icon"><img src=".github/badges/version-dependency-mdit--plugin-icon.svg" alt="@mdit/plugin-icon declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-img-lazyload"><img src=".github/badges/version-dependency-mdit--plugin-img-lazyload.svg" alt="@mdit/plugin-img-lazyload declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-img-mark"><img src=".github/badges/version-dependency-mdit--plugin-img-mark.svg" alt="@mdit/plugin-img-mark declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-img-size"><img src=".github/badges/version-dependency-mdit--plugin-img-size.svg" alt="@mdit/plugin-img-size declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-include"><img src=".github/badges/version-dependency-mdit--plugin-include.svg" alt="@mdit/plugin-include declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-inline-rule"><img src=".github/badges/version-dependency-mdit--plugin-inline-rule.svg" alt="@mdit/plugin-inline-rule declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-ins"><img src=".github/badges/version-dependency-mdit--plugin-ins.svg" alt="@mdit/plugin-ins declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-katex"><img src=".github/badges/version-dependency-mdit--plugin-katex.svg" alt="@mdit/plugin-katex declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-katex-slim"><img src=".github/badges/version-dependency-mdit--plugin-katex-slim.svg" alt="@mdit/plugin-katex-slim declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-layout"><img src=".github/badges/version-dependency-mdit--plugin-layout.svg" alt="@mdit/plugin-layout declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-mark"><img src=".github/badges/version-dependency-mdit--plugin-mark.svg" alt="@mdit/plugin-mark declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-mathjax"><img src=".github/badges/version-dependency-mdit--plugin-mathjax.svg" alt="@mdit/plugin-mathjax declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-mathjax-slim"><img src=".github/badges/version-dependency-mdit--plugin-mathjax-slim.svg" alt="@mdit/plugin-mathjax-slim declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-plantuml"><img src=".github/badges/version-dependency-mdit--plugin-plantuml.svg" alt="@mdit/plugin-plantuml declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-ruby"><img src=".github/badges/version-dependency-mdit--plugin-ruby.svg" alt="@mdit/plugin-ruby declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-snippet"><img src=".github/badges/version-dependency-mdit--plugin-snippet.svg" alt="@mdit/plugin-snippet declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-spoiler"><img src=".github/badges/version-dependency-mdit--plugin-spoiler.svg" alt="@mdit/plugin-spoiler declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-stylize"><img src=".github/badges/version-dependency-mdit--plugin-stylize.svg" alt="@mdit/plugin-stylize declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-sub"><img src=".github/badges/version-dependency-mdit--plugin-sub.svg" alt="@mdit/plugin-sub declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-sup"><img src=".github/badges/version-dependency-mdit--plugin-sup.svg" alt="@mdit/plugin-sup declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-tab"><img src=".github/badges/version-dependency-mdit--plugin-tab.svg" alt="@mdit/plugin-tab declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-tasklist"><img src=".github/badges/version-dependency-mdit--plugin-tasklist.svg" alt="@mdit/plugin-tasklist declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-tex"><img src=".github/badges/version-dependency-mdit--plugin-tex.svg" alt="@mdit/plugin-tex declared version"></a>
<a href="https://www.npmjs.com/package/@mdit/plugin-uml"><img src=".github/badges/version-dependency-mdit--plugin-uml.svg" alt="@mdit/plugin-uml declared version"></a>
<a href="https://www.npmjs.com/package/katex"><img src=".github/badges/version-dependency-katex.svg" alt="katex declared version"></a>

<a href="https://www.npmjs.com/package/minimatch"><img src=".github/badges/version-dependency-minimatch.svg" alt="minimatch declared version"></a>

<a href="https://www.npmjs.com/package/@bjorn3/browser_wasi_shim"><img src=".github/badges/version-dependency-bjorn3--browser_wasi_shim.svg" alt="@bjorn3/browser_wasi_shim declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/lint"><img src=".github/badges/version-dependency-codemirror--lint.svg" alt="@codemirror/lint declared version"></a>
<a href="https://www.npmjs.com/package/@codemirror/merge"><img src=".github/badges/version-dependency-codemirror--merge.svg" alt="@codemirror/merge declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/dockerfile"><img src=".github/badges/version-dependency-dprint--dockerfile.svg" alt="@dprint/dockerfile declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/formatter"><img src=".github/badges/version-dependency-dprint--formatter.svg" alt="@dprint/formatter declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/json"><img src=".github/badges/version-dependency-dprint--json.svg" alt="@dprint/json declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/jupyter"><img src=".github/badges/version-dependency-dprint--jupyter.svg" alt="@dprint/jupyter declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/mago"><img src=".github/badges/version-dependency-dprint--mago.svg" alt="@dprint/mago declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/markdown"><img src=".github/badges/version-dependency-dprint--markdown.svg" alt="@dprint/markdown declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/roslyn"><img src=".github/badges/version-dependency-dprint--roslyn.svg" alt="@dprint/roslyn declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/ruff"><img src=".github/badges/version-dependency-dprint--ruff.svg" alt="@dprint/ruff declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/toml"><img src=".github/badges/version-dependency-dprint--toml.svg" alt="@dprint/toml declared version"></a>
<a href="https://www.npmjs.com/package/@dprint/typescript"><img src=".github/badges/version-dependency-dprint--typescript.svg" alt="@dprint/typescript declared version"></a>
<a href="https://www.npmjs.com/package/@gentrace/codemirror-lang-handlebars"><img src=".github/badges/version-dependency-gentrace--codemirror-lang-handlebars.svg" alt="@gentrace/codemirror-lang-handlebars declared version"></a>
<a href="https://www.npmjs.com/package/@iizukak/codemirror-lang-wgsl"><img src=".github/badges/version-dependency-iizukak--codemirror-lang-wgsl.svg" alt="@iizukak/codemirror-lang-wgsl declared version"></a>
<a href="https://www.npmjs.com/package/@jakebailey/dprint-plugin-gofumpt"><img src=".github/badges/version-dependency-jakebailey--dprint-plugin-gofumpt.svg" alt="@jakebailey/dprint-plugin-gofumpt declared version"></a>
<a href="https://www.npmjs.com/package/@kachick/dprint-plugin-kdl"><img src=".github/badges/version-dependency-kachick--dprint-plugin-kdl.svg" alt="@kachick/dprint-plugin-kdl declared version"></a>
<a href="https://www.npmjs.com/package/@kachick/dprint-plugin-nix"><img src=".github/badges/version-dependency-kachick--dprint-plugin-nix.svg" alt="@kachick/dprint-plugin-nix declared version"></a>
<a href="https://www.npmjs.com/package/@kachick/dprint-plugin-sh"><img src=".github/badges/version-dependency-kachick--dprint-plugin-sh.svg" alt="@kachick/dprint-plugin-sh declared version"></a>
<a href="https://www.npmjs.com/package/@kachick/dprint-plugin-typstyle"><img src=".github/badges/version-dependency-kachick--dprint-plugin-typstyle.svg" alt="@kachick/dprint-plugin-typstyle declared version"></a>
<a href="https://www.npmjs.com/package/@lezer/common"><img src=".github/badges/version-dependency-lezer--common.svg" alt="@lezer/common declared version"></a>
<a href="https://www.npmjs.com/package/@lezer/lr"><img src=".github/badges/version-dependency-lezer--lr.svg" alt="@lezer/lr declared version"></a>
<a href="https://www.npmjs.com/package/@postgres-language-server/wasm"><img src=".github/badges/version-dependency-postgres-language-server--wasm.svg" alt="@postgres-language-server/wasm declared version"></a>
<a href="https://www.npmjs.com/package/@prettier/plugin-xml"><img src=".github/badges/version-dependency-prettier--plugin-xml.svg" alt="@prettier/plugin-xml declared version"></a>
<a href="https://www.npmjs.com/package/@shopify/theme-language-server-browser"><img src=".github/badges/version-dependency-shopify--theme-language-server-browser.svg" alt="@shopify/theme-language-server-browser declared version"></a>
<a href="https://www.npmjs.com/package/@taplo/lsp"><img src=".github/badges/version-dependency-taplo--lsp.svg" alt="@taplo/lsp declared version"></a>
<a href="https://www.npmjs.com/package/@types/node"><img src=".github/badges/version-dependency-types--node.svg" alt="@types/node declared version"></a>
<a href="https://www.npmjs.com/package/@types/semver"><img src=".github/badges/version-dependency-types--semver.svg" alt="@types/semver declared version"></a>
<a href="https://www.npmjs.com/package/@xiechao/codemirror-lang-handlebars"><img src=".github/badges/version-dependency-xiechao--codemirror-lang-handlebars.svg" alt="@xiechao/codemirror-lang-handlebars declared version"></a>
<a href="https://www.npmjs.com/package/cm6-graphql"><img src=".github/badges/version-dependency-cm6-graphql.svg" alt="cm6-graphql declared version"></a>
<a href="https://www.npmjs.com/package/codemirror-lang-hcl"><img src=".github/badges/version-dependency-codemirror-lang-hcl.svg" alt="codemirror-lang-hcl declared version"></a>
<a href="https://www.npmjs.com/package/codemirror-lang-makefile"><img src=".github/badges/version-dependency-codemirror-lang-makefile.svg" alt="codemirror-lang-makefile declared version"></a>
<a href="https://www.npmjs.com/package/diff3"><img src=".github/badges/version-dependency-diff3.svg" alt="diff3 declared version"></a>
<a href="https://www.npmjs.com/package/dockerfile-language-service"><img src=".github/badges/version-dependency-dockerfile-language-service.svg" alt="dockerfile-language-service declared version"></a>
<a href="https://www.npmjs.com/package/dprint-plugin-graphql"><img src=".github/badges/version-dependency-dprint-plugin-graphql.svg" alt="dprint-plugin-graphql declared version"></a>
<a href="https://www.npmjs.com/package/dprint-plugin-malva"><img src=".github/badges/version-dependency-dprint-plugin-malva.svg" alt="dprint-plugin-malva declared version"></a>
<a href="https://www.npmjs.com/package/dprint-plugin-markup"><img src=".github/badges/version-dependency-dprint-plugin-markup.svg" alt="dprint-plugin-markup declared version"></a>
<a href="https://www.npmjs.com/package/dprint-plugin-yaml"><img src=".github/badges/version-dependency-dprint-plugin-yaml.svg" alt="dprint-plugin-yaml declared version"></a>
<a href="https://www.npmjs.com/package/github-slugger"><img src=".github/badges/version-dependency-github-slugger.svg" alt="github-slugger declared version"></a>
<a href="https://www.npmjs.com/package/graphql"><img src=".github/badges/version-dependency-graphql.svg" alt="graphql declared version"></a>
<a href="https://www.npmjs.com/package/graphql-language-service"><img src=".github/badges/version-dependency-graphql-language-service.svg" alt="graphql-language-service declared version"></a>
<a href="https://www.npmjs.com/package/hash-wasm"><img src=".github/badges/version-dependency-hash-wasm.svg" alt="hash-wasm declared version"></a>
<a href="https://www.npmjs.com/package/ignore"><img src=".github/badges/version-dependency-ignore.svg" alt="ignore declared version"></a>
<a href="https://www.npmjs.com/package/jsonc-parser"><img src=".github/badges/version-dependency-jsonc-parser.svg" alt="jsonc-parser declared version"></a>
<a href="https://www.npmjs.com/package/lax-css"><img src=".github/badges/version-dependency-lax-css.svg" alt="lax-css declared version"></a>
<a href="https://www.npmjs.com/package/lax-markup"><img src=".github/badges/version-dependency-lax-markup.svg" alt="lax-markup declared version"></a>
<a href="https://www.npmjs.com/package/lax-sql"><img src=".github/badges/version-dependency-lax-sql.svg" alt="lax-sql declared version"></a>
<a href="https://www.npmjs.com/package/node-html-parser"><img src=".github/badges/version-dependency-node-html-parser.svg" alt="node-html-parser declared version"></a>
<a href="https://www.npmjs.com/package/path-browserify"><img src=".github/badges/version-dependency-path-browserify.svg" alt="path-browserify declared version"></a>
<a href="https://www.npmjs.com/package/prettier"><img src=".github/badges/version-dependency-prettier.svg" alt="prettier declared version"></a>
<a href="https://www.npmjs.com/package/prettier-plugin-svelte"><img src=".github/badges/version-dependency-prettier-plugin-svelte.svg" alt="prettier-plugin-svelte declared version"></a>
<a href="https://www.npmjs.com/package/semver"><img src=".github/badges/version-dependency-semver.svg" alt="semver declared version"></a>
<a href="https://www.npmjs.com/package/vscode-css-languageservice"><img src=".github/badges/version-dependency-vscode-css-languageservice.svg" alt="vscode-css-languageservice declared version"></a>
<a href="https://www.npmjs.com/package/vscode-html-languageservice"><img src=".github/badges/version-dependency-vscode-html-languageservice.svg" alt="vscode-html-languageservice declared version"></a>
<a href="https://www.npmjs.com/package/vscode-json-languageservice"><img src=".github/badges/version-dependency-vscode-json-languageservice.svg" alt="vscode-json-languageservice declared version"></a>
<a href="https://www.npmjs.com/package/vscode-languageserver-protocol"><img src=".github/badges/version-dependency-vscode-languageserver-protocol.svg" alt="vscode-languageserver-protocol declared version"></a>
<a href="https://www.npmjs.com/package/vscode-languageserver-textdocument"><img src=".github/badges/version-dependency-vscode-languageserver-textdocument.svg" alt="vscode-languageserver-textdocument declared version"></a>
<a href="https://www.npmjs.com/package/vscode-languageserver-types"><img src=".github/badges/version-dependency-vscode-languageserver-types.svg" alt="vscode-languageserver-types declared version"></a>
<a href="https://www.npmjs.com/package/vscode-markdown-languageservice"><img src=".github/badges/version-dependency-vscode-markdown-languageservice.svg" alt="vscode-markdown-languageservice declared version"></a>
<a href="https://www.npmjs.com/package/vscode-uri"><img src=".github/badges/version-dependency-vscode-uri.svg" alt="vscode-uri declared version"></a>
<a href="https://www.npmjs.com/package/wgslender-lsp"><img src=".github/badges/version-dependency-wgslender-lsp.svg" alt="wgslender-lsp declared version"></a>
<a href="https://www.npmjs.com/package/yaml-language-server"><img src=".github/badges/version-dependency-yaml-language-server.svg" alt="yaml-language-server declared version"></a>

## Contribution and license

Start with [CONTRIBUTING](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
First-party material uses [AGPL-3.0-only](LICENSE) with applicable
[Section 7 additional terms](LICENSE-ADDITIONAL-TERMS). Bundled assets and the
Code of Conduct retain their own notices. [CITATION.cff](CITATION.cff) describes
this pre-release project; [CHANGELOG.md](CHANGELOG.md) holds unreleased work.
