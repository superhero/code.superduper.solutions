// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { loadLanguage } from "./languages.ts";
import { javascriptDelimiters, javascriptLiteralDelimiters } from "./javascript-delimiters.ts";
import { javascriptExtraOperators } from "./javascript-operators.ts";

Then("additional operator tokens in {string} are {string} for this source:", async function (path, expected, source) {
  await Promise.all([loadLanguage("embedded.js", "auto"), loadLanguage("embedded.ts", "auto")]);
  const state = EditorState.create({ doc: source, extensions: [await loadLanguage(path, "auto")] });
  const tree = ensureSyntaxTree(state, state.doc.length, 1000) ?? syntaxTree(state);
  const ranges = javascriptExtraOperators(tree);
  assert.equal(javascriptExtraOperators(tree), ranges, "Unchanged trees reuse their operator ranges");
  assert.deepEqual(ranges.map(range => source.slice(range.from, range.to)), expected ? expected.split(/\s+/) : []);
});

Then("structural delimiters in {string} are {string} for this source:",async function(path,expected,source){
  await Promise.all([loadLanguage("embedded.js","auto"),loadLanguage("embedded.ts","auto")]);
  const state=EditorState.create({doc:source,extensions:[await loadLanguage(path,"auto")]});
  const tree=ensureSyntaxTree(state,state.doc.length,1000)??syntaxTree(state);
  const ranges=javascriptDelimiters(tree,state.doc);
  assert.equal(javascriptDelimiters(tree,state.doc),ranges);
  assert.deepEqual(ranges.map(range=>`${source.slice(range.from,range.to)}:${range.role}`),expected.split(/\s+/));
});

Then("object and array declaration delimiters in {string} are {string} for this source:",async function(path,expected,source){
  const state=EditorState.create({doc:source,extensions:[await loadLanguage(path,"auto")]});
  const tree=ensureSyntaxTree(state,state.doc.length,1000)??syntaxTree(state);
  const ranges=javascriptLiteralDelimiters(tree);
  assert.equal(javascriptLiteralDelimiters(tree),ranges);
  assert.deepEqual(ranges.map(range=>source.slice(range.from,range.to)),expected.split(/\s+/));
});
