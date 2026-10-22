// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Text } from "@codemirror/state";
import type { Tree } from "@lezer/common";
import { javascriptScopeNames, javascriptFunctionParameters, javascriptMethodParameters } from "./javascript-scopes.ts";
import { javascriptDelimiters, javascriptLiteralDelimiters } from "./javascript-delimiters.ts";
import { javascriptExtraOperators } from "./javascript-operators.ts";

const scopeClasses = { global: "cm-scope-global", parent: "cm-scope-parent", imported: "cm-scope-imported" };
export interface SemanticHighlight { from: number; to: number; classes: string }
// Weak tree ownership lets discarded editor states release their highlight arrays.
const cache = new WeakMap<Tree, { document: Text; ranges: readonly SemanticHighlight[]; maximumWidth: number }>();
export function semanticHighlights(tree: Tree, document: Text): readonly SemanticHighlight[] {
  const existing = cache.get(tree);
  if (existing?.document === document) return existing.ranges;
  const parameters = javascriptFunctionParameters(tree, document);
  const methods = javascriptMethodParameters(tree, document);
  const parameterPositions = new Set([...parameters, ...methods].map(range => range.from));
  const names = javascriptScopeNames(tree, document);
  const calls = [
    ...names.filter(reference => !parameterPositions.has(reference.from) && !reference.className
      && (reference.scope === "parent" || reference.scope === "global")),
    ...parameters, ...methods,
  ].flatMap(reference => reference.callClose !== undefined
    ? [{ from: reference.callClose, to: reference.callClose + 1, classes: "cm-call-close" },
      ...(reference.callOpen !== undefined ? [{ from: reference.callOpen, to: reference.callOpen + 1, classes: "cm-call-open" }] : [])] : []);
  const ranges = [...javascriptLiteralDelimiters(tree).map(range => ({ ...range, classes: "cm-literal-delimiter" })), ...javascriptDelimiters(tree, document).map(range => ({ ...range, classes: `cm-delimiter-${range.role}` })), ...calls, ...names.flatMap(reference => !parameterPositions.has(reference.from) && (reference.scope === "global" || reference.scope === "parent" || reference.scope === "imported")
    ? [{ from: reference.from, to: reference.to, classes: reference.scope === "global" && reference.name === "undefined" ? "cm-syntax-undefined"
      : reference.className && reference.scope !== "imported" ? "cm-scope-class" : `${scopeClasses[reference.scope]}${reference.scope === "parent" && reference.literalConstant ? " cm-parent-const" : ""}${reference.callClose !== undefined ? " cm-call-name" : ""}` }] : []),
    ...parameters.map(range => ({ ...range, classes: `cm-function-parameter${range.callClose !== undefined ? " cm-call-name" : ""}` })),
    ...methods.map(range => ({ ...range, classes: `cm-method-parameter${range.callClose !== undefined ? " cm-call-name" : ""}` })),
    ...javascriptExtraOperators(tree).map(range => ({ ...range, classes:
      document.sliceString(range.from, range.to) === ";" ? "cm-syntax-semicolon"
      : document.sliceString(range.from, range.to) === "?." ? "cm-syntax-dot"
      : document.sliceString(range.from, range.to) === "=>" ? "cm-syntax-operator cm-arrow-operator" : "cm-syntax-operator" }))]
    .sort((a, b) => a.from - b.from);
  let maximumWidth = 0;
  for (const range of ranges) maximumWidth = Math.max(maximumWidth, range.to - range.from);
  cache.set(tree, { document, ranges, maximumWidth });
  return ranges;
}

/** Project sorted highlights without scanning the entire file for each viewport. */
export function visibleSemanticHighlights(tree: Tree, document: Text, visible: readonly { from: number; to: number }[]): SemanticHighlight[] {
  const ranges = semanticHighlights(tree, document);
  const maximumWidth = cache.get(tree)!.maximumWidth;
  const result: SemanticHighlight[] = [];
  for (const { from, to } of visible) {
    let low = 0, high = ranges.length;
    // A highlight beginning before this bound cannot overlap the viewport.
    // Keeping the widest token handles viewports beginning inside a name.
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (ranges[middle]!.from + maximumWidth <= from) low = middle + 1;
      else high = middle;
    }
    for (let index = low; index < ranges.length; index++) {
      const range = ranges[index]!;
      if (range.from >= to) break;
      if (range.to > from) result.push(range);
    }
  }
  return result;
}
