# Application source

This is Vite's source root. `index.html` loads styles, restores cached appearance,
and displays the complete animated loading grid before JavaScript runs. `index.ts`
loads development adapters, and `bootstrap.ts` validates the mount target before
mounting `App.svelte`. The loader covers storage and saved-workspace restoration,
including the editor's final scroll measurements. Nine animated stages show real
operation progress and skipped work, with four, six, or eight visible stages
following current work on compact screens according to available height. Startup failures release it
and render an alert. The repository client initializes an inline worker and local IndexedDB storage.

The top header contains styled Svelte repository and page dropdowns. Repository changes
wait for pending edits; Editor, History, Resources, and Settings switch synchronously within
the current repository. Each page is an independently named region. Repository
creation/import live in the repository menu; the sidebar holds the branch
dropdown at the root of the file tree, including branch creation and switching.

| Responsibility | Location |
| --- | --- |
| Composition, entry, semantic styles, and palette catalog | This directory |
| Reusable logic, logging, utilities, and owned controls | [lib](lib/README.md) |
| Original favicon, local fonts, and their notices | [assets](assets/README.md) |
| Visulima overlay/toolbar adapters | [dev](dev/README.md) |
| Static isolation headers and generated favicon files | `public/` |

Vite embeds application code/styles/fonts and the worker into `dist/index.html`.
It copies `public/_headers` and the nine generated favicon files, giving exactly
11 distribution files. The [build adapters](../build/README.md) generate favicon
derivatives from `assets/favicon.svg` and preserve full license notices in an
inert HTML template. Edit the SVG source, then run `npm run icons:generate`;
`npm run build` verifies generated files are current. Keep other application
assets imported from `assets` so they remain embedded. Additional public files
require an intentional change to the accepted distribution shape.

Source Cucumber scenarios pair `*.feature` with `*.test.mjs` and use the source
profile in [cucumber.config.mjs](../cucumber.config.mjs). `build.*` belongs to
acceptance. Browser scenarios live under [tests](../tests/README.md). Keep test
fixtures and development-only instrumentation out of production.
