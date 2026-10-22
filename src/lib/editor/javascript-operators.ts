// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Tree } from "@lezer/common";
import { forEachJavaScriptRegion } from "./javascript-scopes.ts";

interface OperatorRange { from: number; to: number }
const cache = new WeakMap<Tree, readonly OperatorRange[]>();
// The grammar tags these as punctuation/modifiers/keywords instead of operators.
const extraOperators = new Set(["Arrow", "Spread", "Optional", "?.", "new", "Star", ";", "InterpolationStart", "InterpolationEnd"]);

export function javascriptExtraOperators(tree: Tree): readonly OperatorRange[] {
  const cached = cache.get(tree);
  if (cached) return cached;
  const ranges: OperatorRange[] = [];
  forEachJavaScriptRegion(tree, (root, offset) => root.cursor().iterate(node => {
    if (extraOperators.has(node.name)) ranges.push({ from: node.from + offset, to: node.to + offset });
  }));
  ranges.sort((a, b) => a.from - b.from);
  cache.set(tree, ranges);
  return ranges;
}
