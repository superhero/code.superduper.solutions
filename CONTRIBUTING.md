# Contributing

Read the [README](README.md), [project guidance](AGENTS.md), and
[Code of Conduct](CODE_OF_CONDUCT.md). This editor reuses Operations' complete
repository foundation while keeping its product code focused on browser-local
editing. The [foundation audit](docs/foundation-parity.md) records the boundary.

## Local work and validation

Use the pinned Node.js/npm versions and `npm ci`. Keep dependency versions exact
and the lockfile synchronized. Development runs at `http://127.0.0.1:5175`;
preview uses `http://127.0.0.1:4175`. Both are strict and must not displace other
projects. Add `?dev-tools=1` when development tooling is useful.

Use focused checks for small local iterations; run `npm run check` for broad
changes and release readiness. Use the [test guide](tests/README.md) for
browser prerequisites, targeted profiles, diagnostics, and explicit local
fallback. Register independently evaluated behavior as named Cucumber scenarios
so it appears in the combined report. Add meaningful assertions with features;
100% scoped coverage does not establish whole-UI correctness.

Keep source, tests, relevant ADRs, directory guidance, and generated badges in
sync. Preserve semantic theme roles, accessible controls, local asset notices,
error causes, and the boundary between browser content and server-delivered
frontend assets. Do not implement editor features solely to exercise tooling.

## History and automation

The prepared Gitflow model uses feature/integration fixes into `develop`,
stabilization fixes into release branches, release/hotfix validation into
`main`, and synchronization back to development. Documentation branches follow
the constrained documentation workflow. See the
[workflow guide](.github/workflows/README.md) for exact branch, changelog, merge,
and release contracts.

Use the appropriate topic branch and complete the validation above before
submitting changes. Preparing workflow files does not activate publication or
repository administration: mutating automation requires
`CODE_AUTOMATION_ENABLED=true` and separately provisioned permissions/resources,
as described in the workflow guide. Never put credentials in source or browser
bundles.

## Licensing and attribution

By submitting a contribution, you agree that it is licensed under **GNU
AGPLv3-only** (`AGPL-3.0-only`) together with `LICENSE-ADDITIONAL-TERMS`.
You retain the copyright in your contribution unless you separately assign it
in writing. By contributing, you represent that you have the right to submit
the contribution under these terms.

Preserve existing copyright, license, attribution, and Section 7 notices.
For new first-party comment-capable source files, include copyright/year/author,
`SPDX-License-Identifier: AGPL-3.0-only`, and a pointer to `LICENSE` and
`LICENSE-ADDITIONAL-TERMS`. Third-party assets retain their own licenses.

## Architectural decision records

- [Architectural reasoning is maintained in focused decision records](docs/adr/decision-records.md).
- [Artifacts with distinct responsibilities remain separate](docs/adr/responsibility-segregation.md).
- [Browser models install independently of the application](docs/adr/browser-local-models.md).
- [Browser-local repositories retain their files and full Git history](docs/adr/local-resource-management.md).
- [Continuous deployment promotes validated artifacts with revision traceability](docs/adr/continuous-deployment.md).
- [Continuous integration follows Gitflow with explicit automation enablement](docs/adr/continuous-integration.md).
- [Dedicated workers own substantial background processing](docs/adr/dedicated-workers.md).
- [Encrypted browser vaults guard reusable AI credentials](docs/adr/encrypted-browser-vault.md).
- [Errors preserve native diagnostic detail and explicit recovery](docs/adr/error-view.md).
- [First-party code uses AGPLv3-only with Section 7 terms](docs/adr/licensing-choice.md).
- [Git-backed editing history remains independent of normal repository commits](docs/adr/editor-history.md).
- [Local assistant chat starts with direct Ollama transport](docs/adr/local-ollama-chat.md).
- [Optional syntax packages separate installation from activation](docs/adr/optional-syntax-packages.md).
- [Upstream connections use optional SDKs and explicit browser Git transport](docs/adr/upstream-integrations.md).
- [Optional language engines are explicitly installed and activated](docs/adr/optional-language-engines.md).
- [Optional formatters are explicitly installed as verified local packages](docs/adr/optional-formatters.md).
- [Resource monitoring preserves measurement boundaries and privacy](docs/adr/resource-monitoring.md).
- [Runtime secrets stay outside source, bundles, logs, and reports](docs/adr/runtime-secrets.md).
- [Simple solutions completely meet the agreed requirement](docs/adr/simplicity.md).
- [Speech input stays local and augments AI drafts](docs/adr/browser-speech-input.md).
- [Svelte controls share semantic themes, assets, and interaction rules](docs/adr/svelte-interface.md).
- [Test reports cover every scenario and coverage has an explicit scope](docs/adr/test-suite-reports.md).
