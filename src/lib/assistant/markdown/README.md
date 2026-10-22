# Markdown extensions

This directory owns the assistant's mdit integration. The parent
[`markdown.ts`](../markdown.ts) owns shared parser construction, escaped output,
message-scoped preparation and stable streaming blocks. The
[syntax guide](../../../../docs/markdown.md) records the complete catalog and
concrete host configurations.

- `plugins.ts` configures the catalog and resolves overlapping grammars. Keep
  image renderers idle and document IDs stable. Inline titles cannot contain
  nested controls. Preserve fence metadata before the attributes core rule.
- `composer.ts` extends the incremental Lezer grammar. Keep source and markers
  visible; typing must not render HTML, initialize math or read repository files.
- `resources.ts` validates URLs and emits explicit preview controls.
  `interactions.ts` owns delegated tabs, spoilers, anchors and preview activation.
  Keep keyboard and grouped-tab behavior consistent and release listeners.
- `imports.ts` adapts include/snippet to the browser repository reader, bounds
  expansion and caches by repository revision. Never use host filesystem APIs,
  fetch an include URL, mutate a working file or expand provider payloads.
- `mathjax.ts` initializes local SVG math only when needed, with static TeX
  package registration, macro isolation and a bounded result cache. The upstream
  default factory brings Node/CDN imports and unused CHTML font code into a
  standalone bundle; retain the owned browser adapter and source attribution.
- `types.ts` owns the per-render environment. Do not reuse it across documents.

Browser adaptations retain upstream notices in [`../NOTICES.md`](../NOTICES.md).
Named source scenarios live in the parent's Markdown feature; interactions and
packaging belong to the existing browser and build profiles.
