# Error reporting

> [!IMPORTANT]
> Preserve useful error details in diagnostics and provide recovery appropriate to the failing operation.

## Shared diagnostics

Pail provides scoped application logging. Preserve native stacks, error codes,
and cause chains; use structured inspection for other values. Do not fabricate
source locations when an error has no stack. Avoid logging file contents,
repository credentials, or other private workspace data.

Errors remain visible through both the appropriate user interface and the
console. Machine-readable output remains unformatted. Current startup failures
render a descriptive alert while retaining the original console diagnostics.

## Development tooling

Visulima supplies the themed error overlay and developer toolbar. Cause
navigation remains distinct from the history of unrelated errors. The logger
and overlay adapters limit console forwarding to avoid transport-reporting
loops, and uncaught exceptions and rejected promises remain visible.

The toolbar is opt-in through `?dev-tools=1`; the error overlay operates
independently. Both are development-only and must be absent from production.
Dependency upgrades require browser checks because injected runtime and private
DOM structures can change.

## Product recovery

The initial page has no editor/storage operations. Future failures must identify
the affected operation, retain unsaved work, and offer an explicit retry or
export route where possible. A generic success state or silent fallback must
not conceal failed persistence.
