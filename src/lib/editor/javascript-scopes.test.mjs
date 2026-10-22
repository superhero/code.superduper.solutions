// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { EditorState, Text } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { loadLanguage } from "./languages.ts";
import { javascriptScopeNames } from "./javascript-scopes.ts";
import { semanticHighlights, visibleSemanticHighlights } from "./semantic-highlights.ts";

Then("undefined styles in {string} are {string} for this source:", async function (path, expected, source) {
  await Promise.all([loadLanguage("embedded.js", "auto"), loadLanguage("embedded.ts", "auto")]);
  const state = EditorState.create({ doc: source, extensions: [await loadLanguage(path, "auto")] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  assert.ok(tree, "The full sample must be parsed");
  const styles = semanticHighlights(tree, state.doc)
    .filter(range => source.slice(range.from, range.to) === "undefined")
    .map(range => range.classes.split(" ")[0]);
  assert.deepEqual(styles, expected ? expected.split(/\s+/) : []);
});

Then("indexed semantic viewports preserve overlapping tokens and separated visible ranges", async function () {
  const source = "const longParentName = [1, true];\n" + Array.from({ length: 100 }, (_, index) => `function read${index}(value) { return Math.min(value, longParentName); }`).join("\n");
  const state = EditorState.create({ doc: source, extensions: [await loadLanguage("main.js", "auto")] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  const all = semanticHighlights(tree, state.doc);
  for (let from = 0; from < source.length; from += 17) {
    const visible = [{ from, to: Math.min(source.length, from + 23) }, { from: source.length - 10, to: source.length }];
    const expected = visible.flatMap(({ from, to }) => all.filter(range => range.to > from && range.from < to));
    assert.deepEqual(visibleSemanticHighlights(tree, state.doc, visible), expected);
  }
  assert.deepEqual(visibleSemanticHighlights(tree, state.doc, []), []);
});

Then("semantic highlights reuse unchanged syntax and invalidate changed documents and trees", async function () {
  const state = EditorState.create({ doc: "const limit = 1024 * 1024; function read() { return limit; }", extensions: [await loadLanguage("main.js", "auto")] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  const first = semanticHighlights(tree, state.doc);
  assert.ok(first.some(range => range.classes.includes("cm-parent-const")));
  assert.equal(semanticHighlights(tree, state.doc), first);
  const equivalentDocument = Text.of(state.doc.toString().split("\n"));
  const refreshed = semanticHighlights(tree, equivalentDocument);
  assert.notEqual(refreshed, first);
  assert.deepEqual(refreshed, first);
  const changed = state.update({ changes: { from: 14, to: 25, insert: "load()" } }).state;
  const changedTree = ensureSyntaxTree(changed, changed.doc.length, 1000);
  const next = semanticHighlights(changedTree, changed.doc);
  assert.notEqual(next, first);
  assert.ok(!next.some(range => range.classes.includes("cm-parent-const")));
});

Then("class-like scope references in {string} are {string} for this source:", async function (path, expected, source) {
  const state = EditorState.create({doc:source,extensions:[await loadLanguage(path,"auto")]});
  const tree = ensureSyntaxTree(state,state.doc.length,1000) ?? syntaxTree(state);
  assert.deepEqual(javascriptScopeNames(tree,state.doc).filter(reference=>reference.className).map(reference=>reference.name),
    expected ? expected.split(/\s+/) : []);
});

Then("scope references in {string} are {string} for this source:", async function (path, expected, source) {
  await Promise.all([loadLanguage("embedded.js", "auto"), loadLanguage("embedded.ts", "auto")]);
  const state = EditorState.create({ doc: source, extensions: [await loadLanguage(path, "auto")] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  const references = javascriptScopeNames(tree, state.doc);
  assert.equal(javascriptScopeNames(tree, state.doc), references, "Unchanged trees reuse their scope analysis");
  assert.deepEqual(references.map(reference => `${reference.name}:${reference.scope}`), expected.trim() ? expected.trim().split(/\s+/) : []);
  for (const reference of references) assert.equal(source.slice(reference.from, reference.to), reference.name, "Reference ranges use document coordinates");
});

Then("scope analysis caches trees without confusing document identities", async function () {
  const state = EditorState.create({ doc: "Math;", extensions: [await loadLanguage("main.js", "auto")] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000);
  const first = javascriptScopeNames(tree, state.doc);
  assert.equal(javascriptScopeNames(tree, state.doc), first);
  const changed = javascriptScopeNames(tree, Text.of(["Date;"]));
  assert.notEqual(changed, first);
  assert.deepEqual(changed.map(({ name, scope }) => [name, scope]), [["Date", "global"]]);
});

Then("parent-scope constant references in {string} are {string} for this source:",async function(path,expected,source){
  const state=EditorState.create({doc:source,extensions:[await loadLanguage(path,"auto")]});
  const tree=ensureSyntaxTree(state,state.doc.length,1000)??syntaxTree(state);
  assert.deepEqual(javascriptScopeNames(tree,state.doc).filter(reference=>reference.scope==="parent"&&reference.literalConstant&&!reference.className).map(reference=>reference.name),expected ? expected.split(/\s+/) : []);
});
