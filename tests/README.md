# Test infrastructure

All independently meaningful cases are named Gherkin scenarios or scenario-outline
examples. The source, acceptance, automation, browser, and speech profiles write
separate JSON files under `tmp/test`; the combined report includes all five.
Speech uses the developer-requested Vitest/QuickPickle runner. Its report adapter
preserves each named scenario with a runner-result step; detailed assertions
and failures remain in `speech-vitest.json`.
Those Vitest assertions are not merged into C8's source coverage artifact;
no speech coverage percentage is claimed, and the existing coverage gate is
unchanged. Real speech-model tests are explicit fixture-backed runs documented
in the [speech guide](../src/lib/assistant/speech/README.md).
There is no unreported standalone smoke suite.

| Command | Responsibility |
| --- | --- |
| `npm run test:source` | Bootstrap, logging, error handling, preferences, EditorConfig and the injectable Git engine |
| `npm run test:source:coverage` | The same source scenarios with V8 coverage collection |
| `npm run build && npm run test:acceptance` | Production artifact contents and packaging boundaries |
| `npm run test:automation` | Repository scripts and reporting behavior |
| `npm run test:browser` | Built-page and isolated development-page behavior through Playwright |
| `npm run test:speech` | Vitest/QuickPickle speech algorithms, lifecycle and optional-runtime packaging |
| `npm run test:speech:live` | Explicit real-model Chromium recordings; pinned local model/audio fixtures required |
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

LFM3 adapter checks live in named QuickPickle scenarios under tests/models/.
Run npm run test:models for the focused ONNX device/readout/catalog checks.
The regular test:speech profile also includes them alongside microphone lifecycle
checks, so their outcomes enter the existing Cucumber-compatible report.

Real LFM3/Phonon editor scenarios are in tests/browser/live/browser-models.feature.
Run models serially on sds-01 under its shared attempt-isolation lock.
MODEL_LIVE_PINNED_CACHE=1 is a test-only delivery override for already prepared,
exact pinned ONNX graph files from the reference host. Installed-file SHA256
verification remains active. It does not qualify public CDN delivery; metadata,
tokenizer and normal production installs retain their pinned publisher URLs.
