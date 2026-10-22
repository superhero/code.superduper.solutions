# Development interface adapters

This directory owns Visulima-specific error transport, cause navigation,
overlay styling, toolbar theme adaptation, and tooltips. Production application
logging lives in [lib](../lib/README.md).

[index.ts](../index.ts) loads context and toolbar adapters only in development.
[vite.config.mjs](../../vite.config.mjs) injects the early error-chain hook and
overlay CSS. The toolbar is opt-in through `?dev-tools=1`; overlay operation is
independent. Retain cleanup of observers, listeners, and mounted tooltips during
hot replacement.

The shared [startup loader](../lib/components/loading/README.md) dismisses when
the workspace is ready. For design work, `?loaders=1` or
`VITE_LOADING_GALLERY=true` explicitly keeps it visible after startup;
`?editor=1` always uses normal dismissal. The loader and its progress reporting
also ship in production; only the persistent preview is development-specific. The preview
reads the browser's repository and workspace state through ordinary startup,
without simulating progress or recording new workspace actions.

The Vite adapter suppresses the toolbar dependency's redundant initialization
broadcast on each websocket connection. Its client already initializes on
document load; broadcasting again races startup and resets other open tabs.
The adapter recognizes only the pinned dependency's exact listener and fails
clearly when that hook changes. Browser scenarios cover simultaneous tabs and
server restart, including restored toolbar RPC behavior.

Preserve native error types, stacks, codes, and causes. Missing source locations
stay missing, and cause navigation remains separate from unrelated error history.
Keep console-forwarding limits that prevent transport-error feedback loops.
The [error ADR](../../docs/adr/error-view.md) owns these diagnostic principles.

Dependency upgrades can change private DOM and injected runtime structures.
Run source diagnostic scenarios and the browser profile after adapter changes;
acceptance also verifies that development integrations do not ship in production.
