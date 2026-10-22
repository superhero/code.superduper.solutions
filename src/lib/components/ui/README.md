# Owned UI primitives

This directory owns adapted shadcn-svelte source for [Button](button/README.md)
and [Sheet](sheet/README.md). Bits UI provides headless behavior; local source
provides composition and semantic styling.

`menu.css` owns the shared appearance of Bits UI navigation dropdowns and file
context menus: semantic menu colors, focus and hover states, and reduced-motion
compatible entry transitions. Menu interaction stays in the Svelte components.
Menus fit their contents within the viewport instead of imposing a minimum width.
All interface controls are borderless, including focus, invalid and selected
states. Use palette fills and foreground colors for keyboard focus; never add
outline or ring utilities outside CodeMirror. Shared rules in `src/app.css`
also cover controls rendered through portals.

## Provenance and licenses

The Button/Sheet source and supporting utility types were adapted through the
local Operations project. Its registry configuration and UI guide identify
shadcn-svelte as the origin, but the exact original registry import revision is
not recorded. Do not treat the current upstream revision as that import.

The complete [upstream MIT notice](LICENSE.shadcn-svelte) preserves the copyright
and permission notices for derived portions. It was retrieved and checked on
2026-10-13 from the [official upstream license](https://github.com/huntabyte/shadcn-svelte/blob/63bfef7dadfcc412c99f6e87069dc0b36cfd1f72/LICENSE.md).
This is the verified license snapshot, not a claim about original code ancestry.
Project modifications retain their AGPL-3.0-only and Section 7 notices; these
do not replace the MIT notices. Carry both when adapting or distributing the
components, including relevant built-artifact attribution.

## Integration

[components.json](../../../../components.json) routes generated UI here and
points Tailwind to [app.css](../../../app.css). Public exports live in each
component's `index.ts`; class/prop utilities live in [utils.ts](../../utils.ts).

Preserve forwarded props, bindable refs, child snippets, accessible semantics,
and `data-slot` hooks. Review local adaptations before replacing registry source.
Keep editor orchestration outside these generic controls, and verify any newly
used interaction in the browser.
