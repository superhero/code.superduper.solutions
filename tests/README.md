# Test infrastructure

All independently meaningful cases are Cucumber scenarios or scenario-outline
examples. The source, acceptance, automation, and browser profiles write
separate JSON files under `tmp/test`; the combined report includes all four.
There is no unreported standalone smoke suite.

| Command | Responsibility |
| --- | --- |
| `npm run test:source` | Bootstrap, logging, error handling, preferences, EditorConfig and the injectable Git engine |
| `npm run test:source:coverage` | The same source scenarios with V8 coverage collection |
| `npm run build && npm run test:acceptance` | Production artifact contents and packaging boundaries |
| `npm run test:automation` | Repository scripts and reporting behavior |
| `npm run test:browser` | Built-page and isolated development-page behavior through Playwright |
| `npm run test:coverage` | Produce coverage reports and require the configured thresholds |

Source scenarios pair `src/*.feature` and `src/*.test.mjs`. Build acceptance
uses `src/build.*` and `src/favicons.*` for packaging, image formats and generated
asset freshness. Automation scenarios live under `.github/tests/`.
Browser scenarios, support, and failure artifacts are described in
[`browser/README.md`](browser/README.md). Test-only development error fixtures
live in `fixtures/`; they never ship in the built page.

## Coverage boundary

`.c8rc.json` includes executable application TypeScript under `src/`, including
unexecuted files, and requires 100% statements, branches, functions, and lines
within that explicit scope. Measured production logic includes bootstrap, logger, preferences, EditorConfig,
path/text validation, directory-tree modeling, desktop-drop traversal, linked Git import assembly and the
injectable repository engine. Source scenarios use
real Git objects and temporary filesystems, including journal-failure checkpoints. The percentage is not whole-application coverage.

The DOM entry, declarations, development adapters, vendored UI primitives, and
UI class-composition utility are excluded. Type-only repository contracts and the
DOM/IndexedDB/worker adapters (`startup.ts`, `editor/configuration.ts`, `repository/browser.ts`,
`client.ts`, `worker.ts`, `worker-runtime.ts`, and the editor's `match-outlines.ts`) have no Node coverage claim: real Chromium integration
scenarios exercise their observable behavior. The full persistence engine remains
in the 100% source scope. Browser scenarios validate actual
mounting, packaging, font loading, layout, theme application, development
toolbar gating, error-overlay integration, and shared button, tooltip, and
sheet keyboard behavior in isolated fixtures. Source scenarios separately
exercise runtime normalization and error-chain edge cases even though those
development adapters are outside the production coverage denominator.

Keep new application logic in the measured scope. Expand behavior scenarios
when a feature is introduced; do not exclude code to make a threshold pass.
Review the scope whenever new adapters or components are added.
