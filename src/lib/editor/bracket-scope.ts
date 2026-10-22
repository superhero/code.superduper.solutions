// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { countColumn } from "@codemirror/state";
import { bracketMatching } from "@codemirror/language";
import { Decoration, Direction, EditorView, layer, RectangleMarker } from "@codemirror/view";

function activePairs(view: EditorView) {
  const pairs = new Map<Decoration, number[]>();
  // Read the native matcher's actual decorations, including offscreen endpoints.
  // Group by mark identity so positions remain correct when composition maps them.
  for (const source of view.state.facet(EditorView.decorations)) {
    const decorations = typeof source === "function" ? source(view) : source;
    decorations.between(0, view.state.doc.length, (from, _to, mark) => {
      if (!mark.spec.bracketScope) return;
      const endpoints = pairs.get(mark) ?? [];
      endpoints.push(from);
      pairs.set(mark, endpoints);
    });
  }
  return pairs.values();
}

export const bracketScope = [
  bracketMatching({
    renderMatch(match) {
      const mark = Decoration.mark({
        class: match.matched
          ? `cm-matchingBracket${match.end && (match.start.to === match.end.from || match.end.to === match.start.from) ? " cm-emptyBracketPair" : ""}`
          : "cm-nonmatchingBracket",
        bracketScope: match.matched && Boolean(match.end),
      });
      const marks = [mark.range(match.start.from, match.start.to)];
      if (match.end) marks.push(mark.range(match.end.from, match.end.to));
      return marks;
    },
  }),
  layer({
    above: true,
    class: "cm-bracketScopeLayer",
    update: update => update.selectionSet || update.docChanged || update.viewportChanged,
    markers(view) {
      const line = view.contentDOM.querySelector<HTMLElement>(".cm-line");
      if (!line) return [];
      const scroll = view.scrollDOM, viewport = scroll.getBoundingClientRect();
      const ltr = view.textDirection === Direction.LTR;
      const originX = (ltr ? viewport.left : viewport.right - scroll.clientWidth * view.scaleX)
        - scroll.scrollLeft * view.scaleX;
      const originY = viewport.top - scroll.scrollTop * view.scaleY;
      const lineBounds = line.getBoundingClientRect(), style = getComputedStyle(line);
      const columnZero = ltr ? lineBounds.left + parseFloat(style.paddingLeft) * view.scaleX
        : lineBounds.right - parseFloat(style.paddingRight) * view.scaleX;
      const markers: RectangleMarker[] = [], seen = new Set<string>();
      for (const endpoints of activePairs(view)) {
        if (endpoints.length !== 2) continue;
        const from = Math.min(...endpoints), to = Math.max(...endpoints);
        const key = `${from}:${to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const opening = view.lineBlockAt(from), closing = view.lineBlockAt(to);
        // A folded scope and a single-line pair occupy the same visual block.
        if (opening.from === closing.from && opening.to === closing.to) continue;
        const indentation = (position: number) => countColumn(
          view.state.doc.lineAt(position).text.match(/^[\t ]*/)?.[0] ?? "", view.state.tabSize);
        const column = Math.min(indentation(from), indentation(to));
        const x = columnZero + (ltr ? 1 : -1) * (column * view.defaultCharacterWidth + 3);
        // Let the scroller clip the full span, so small scrolls need no repaint.
        const top = view.documentTop + opening.bottom + 7;
        const bottom = view.documentTop + closing.top - 7;
        if (bottom > top) markers.push(new RectangleMarker("cm-bracketScopeGuide",
          x - originX, top - originY, 1, bottom - top));
      }
      return markers;
    },
  }),
  EditorView.theme({
    ".cm-bracketScopeGuide": {
      color: "var(--palette-8)",
      backgroundImage: "radial-gradient(circle at .5px .5px, currentColor .5px, transparent .5px)",
      backgroundSize: "1px 5px",
      backgroundRepeat: "repeat-y",
      pointerEvents: "none",
    },
  }),
];
