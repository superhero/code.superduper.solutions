// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { Direction, EditorView, layer, RectangleMarker } from "@codemirror/view";

export function selectionMatchOutlines() {
  return [
    layer({
      above: true,
      class: "cm-selectionMatchOutlines",
      update: update => update.selectionSet || update.docChanged || update.viewportChanged,
      markers(view) {
        // Empty layers can be hidden; use the scroller's stable document origin.
        const scroll = view.scrollDOM, bounds = scroll.getBoundingClientRect();
        const base = {
          left: (view.textDirection === Direction.LTR ? bounds.left : bounds.right - scroll.clientWidth * view.scaleX)
            - scroll.scrollLeft * view.scaleX,
          top: bounds.top - scroll.scrollTop * view.scaleY,
        };
        // Token matches and bracket pairs share one style without changing text layout.
        const matches = Array.from(view.contentDOM.querySelectorAll(".cm-selectionMatch, .cm-matchingBracket:not(.cm-emptyBracketPair)")).flatMap(match =>
          Array.from(match.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0).map(rect =>
            new RectangleMarker("cm-selectionMatchOutline", rect.left - base.left,
              rect.top - base.top, rect.width, rect.height)));
        const selection=view.state.selection.main;
        if(!selection.empty && view.contentDOM.querySelector(".cm-selectionMatch"))
          matches.push(...RectangleMarker.forRange(view,"cm-selectionSourceUnderline",selection));
        return matches;
      }
    }),
    EditorView.theme({
      ".cm-selectionSourceUnderline": {
        boxShadow: "0 1px 0 0 var(--palette-8), 0 2px 0 0 color-mix(in srgb, var(--palette-8) 50%, transparent)", pointerEvents: "none"
      },
      ".cm-selectionMatchOutline": {
        outline: "1px solid var(--palette-8)", outlineOffset: "0px", borderRadius: "4px",
        boxShadow: "0 0 0 2px color-mix(in srgb, var(--palette-8) 50%, transparent)",
        pointerEvents: "none"
      }
    })
  ];
}
