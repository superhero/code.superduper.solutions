// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { EditorSelection } from "@codemirror/state";
import { EditorView, layer, RectangleMarker } from "@codemirror/view";

const epsilon = 0.1;
const near = (a: number, b: number) => Math.abs(a - b) < epsilon;
const right = (rect: RectangleMarker) => rect.left + (rect.width ?? 0);
const bottom = (rect: RectangleMarker) => rect.top + rect.height;

class JoinedSelectionMarker extends RectangleMarker {
  readonly corners: string;

  constructor(rect: RectangleMarker, corners: string) {
    super("cm-selectionBackground", rect.left, rect.top, rect.width, rect.height);
    this.corners = corners;
  }

  eq(other: RectangleMarker) {
    return other instanceof JoinedSelectionMarker && super.eq(other) && this.corners === other.corners;
  }

  draw() {
    const element = super.draw();
    element.style.borderRadius = this.corners;
    return element;
  }

  update(element: HTMLElement, previous: RectangleMarker) {
    if (!super.update(element, previous)) return false;
    element.style.borderRadius = this.corners;
    return true;
  }
}

function joinFragments(fragments: readonly RectangleMarker[]) {
  // Bidi text can split one visual row into touching horizontal fragments.
  const rows: RectangleMarker[] = [];
  for (const rect of [...fragments].sort((a, b) => a.top - b.top || a.left - b.left)) {
    if (!rect.width || rect.height <= 0) continue;
    const previous = rows.at(-1);
    if (previous && near(previous.top, rect.top) && near(bottom(previous), bottom(rect))
      && rect.left <= right(previous) + epsilon) {
      rows[rows.length - 1] = new RectangleMarker("cm-selectionBackground", previous.left,
        previous.top, Math.max(right(previous), right(rect)) - previous.left, previous.height);
    } else rows.push(rect);
  }
  return rows.map(rect => {
    const corner = (top: boolean, left: boolean) => rows.some(other => other !== rect
      && near(top ? bottom(other) : other.top, top ? rect.top : bottom(rect))
      && (left
        ? other.left <= rect.left + epsilon && right(other) > rect.left + epsilon
        : right(other) >= right(rect) - epsilon && other.left < right(rect) - epsilon)) ? "0px" : "4px";
    return new JoinedSelectionMarker(rect,
      `${corner(true, true)} ${corner(true, false)} ${corner(false, false)} ${corner(false, true)}`);
  });
}

// Match drawSelection's native main selection on iOS; its handles stay untouched.
export const nativeMainSelection = typeof navigator !== "undefined"
  && (/Apple Computer/.test(navigator.vendor)
    && (/Mobile\/\w+/.test(navigator.userAgent) || navigator.maxTouchPoints > 2));

export const joinedSelectionBackground = [
  EditorView.editorAttributes.of(view => ({
    class: view.state.selection.ranges.some(range => !range.empty) ? "cm-has-selection" : ""
  })),
  layer({
    above: false,
    class: "cm-joinedSelectionLayer",
    update: update => update.docChanged || update.selectionSet || update.viewportChanged,
    markers: view => view.state.selection.ranges.flatMap(range => {
      if (range.empty || nativeMainSelection && range === view.state.selection.main) return [];
      const fragments: RectangleMarker[] = [];
      // Build each selected logical line separately so CodeMirror does not
      // extend multiline selections through the empty space to the right.
      for (const visible of view.visibleRanges) {
        const from = Math.max(range.from, visible.from), to = Math.min(range.to, visible.to);
        if (from >= to) continue;
        let line = view.state.doc.lineAt(from);
        while (line.from < to) {
          const start = Math.max(from, line.from), end = Math.min(to, line.to);
          if (start < end) fragments.push(...RectangleMarker.forRange(view,
            "cm-selectionBackground", EditorSelection.range(start, end)));
          if (line.to >= to || line.number === view.state.doc.lines) break;
          line = view.state.doc.line(line.number + 1);
        }
      }
      return joinFragments(fragments);
    }),
  }),
  EditorView.theme({
    ".cm-selectionLayer > .cm-selectionBackground": { display: "none" },
  }),
];
