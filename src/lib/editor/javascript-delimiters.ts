// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import type { ColorRole } from "./color-mappings.ts";
import { javascriptScopeNames, javascriptFunctionParameters, javascriptMethodParameters, forEachJavaScriptRegion } from "./javascript-scopes.ts";

interface DelimiterRange { from: number; to: number; role: ColorRole }
const cache = new WeakMap<Tree, { document: Text; ranges: readonly DelimiterRange[] }>();
const controls = new Set(["IfStatement", "SwitchStatement", "TryStatement", "CatchClause", "FinallyClause", "ForStatement", "WhileStatement", "DoStatement"]);
const functions = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunction", "MethodDeclaration"]);
const literalCache = new WeakMap<Tree, readonly { from: number; to: number }[]>();

/** Literal and destructuring delimiters, excluding indexing and statement bodies. */
export function javascriptLiteralDelimiters(tree: Tree): readonly { from: number; to: number }[] {
  const existing = literalCache.get(tree);
  if (existing) return existing;
  const ranges: { from: number; to: number }[] = [];
  forEachJavaScriptRegion(tree, (root, offset) => root.cursor().iterate(cursor => {
    if (!["ObjectExpression", "ArrayExpression", "ObjectPattern", "ArrayPattern"].includes(cursor.name)) return;
    for (let child = cursor.node.firstChild; child; child = child.nextSibling)
      if (["{", "}", "[", "]"].includes(child.name)) ranges.push({ from: child.from + offset, to: child.to + offset });
  }));
  ranges.sort((a, b) => a.from - b.from);
  literalCache.set(tree, ranges);
  return ranges;
}

/** Color only structural delimiters, leaving nested objects and expressions alone. */
export function javascriptDelimiters(tree: Tree, document: Text): readonly DelimiterRange[] {
  const existing = cache.get(tree);
  if (existing?.document === document) return existing.ranges;
  const ranges: DelimiterRange[] = [];
  let indexedNames: Map<number, ColorRole> | undefined;
  const indexedRole = (node: SyntaxNode | null, offset: number): ColorRole => {
    if (!node) return "text";
    if (node.name === "MemberExpression")
      return node.getChild("PropertyName") || node.getChild("PrivatePropertyName") ? "property" : indexedRole(node.firstChild, offset);
    if (node.name === "VariableName") {
      if (!indexedNames) {
        indexedNames = new Map<number, ColorRole>(javascriptScopeNames(tree, document).map(reference => [reference.from,
          reference.className && reference.scope !== "imported" ? "type"
            : reference.scope === "parent" ? "parentText" : reference.scope === "global" ? "globalText"
            : reference.scope === "imported" ? "imported" : "text"]));
        for (const parameter of javascriptFunctionParameters(tree, document)) indexedNames.set(parameter.from, "parameterText");
        for (const parameter of javascriptMethodParameters(tree, document)) indexedNames.set(parameter.from, "text");
      }
      return indexedNames.get(node.from + offset) ?? "text";
    }
    if (node.name === "CallExpression") return "function";
    if (node.name === "NewExpression") return "type";
    if (node.name === "this" || node.name === "super") return "keyword";
    if (node.name === "ParenthesizedExpression") return indexedRole(node.firstChild?.nextSibling ?? null, offset);
    return "text";
  };
  forEachJavaScriptRegion(tree, (root, offset) => {
    const delimiters = (node: SyntaxNode, role: DelimiterRange["role"]) => {
      for (let child = node.firstChild; child; child = child.nextSibling)
        if (["(", ")", "{", "}"].includes(child.name))
          ranges.push({ from: child.from + offset, to: child.to + offset, role });
    };
    root.cursor().iterate(cursor => {
      const node = cursor.node;
      if (node.name === "String" || node.name === "TemplateString") {
        const first = document.sliceString(node.from + offset, node.from + offset + 1);
        if (["'", '"', "`"].includes(first)) {
          ranges.push({ from: node.from + offset, to: node.from + offset + 1, role: "string" });
          if (node.to > node.from + 1 && document.sliceString(node.to + offset - 1, node.to + offset) === first)
            ranges.push({ from: node.to + offset - 1, to: node.to + offset, role: "string" });
        }
      }
      if (node.name === "MemberExpression" && node.getChild("[")) {
        const role = indexedRole(node.firstChild, offset);
        for (let child = node.firstChild; child; child = child.nextSibling)
          if (child.name === "[" || child.name === "]") ranges.push({ from: child.from + offset, to: child.to + offset, role });
      }
      const classBody = node.name === "ClassDeclaration" || node.name === "ClassExpression";
      const property = node.getChild("PropertyDefinition");
      const constructor = node.name === "MethodDeclaration" && property
        && document.sliceString(property.from + offset, property.to + offset) === "constructor"
        && !node.getChild("static") && !node.getChild("get") && !node.getChild("set");
      const role = classBody ? "type" : node.name === "ArrowFunction" ? "operator" : controls.has(node.name) ? "keyword"
        : functions.has(node.name) || node.name === "Property" && node.getChild("ParamList") ? "function" : undefined;
      if (role) {
        delimiters(node, role);
        for (let child = node.firstChild; child; child = child.nextSibling)
          if (["ParenthesizedExpression", "ParamList", "Block", "SwitchBody", "ClassBody", "ForSpec", "ForOfSpec", "ForInSpec"].includes(child.name))
            delimiters(child, constructor && child.name === "ParamList" ? "type" : role);
      } else if (node.name === "CallExpression" || node.name === "NewExpression") {
        const argumentsList = node.getChild("ArgList");
        if (argumentsList) delimiters(argumentsList, node.name === "NewExpression" ? "type" : "function");
      }
    });
  });
  ranges.sort((a, b) => a.from - b.from);
  cache.set(tree, { document, ranges });
  return ranges;
}
