// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { EditorState, Text } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { loadLanguage } from "./languages.ts";
import { javascriptScopeNames, javascriptFunctionParameters, javascriptMethodParameters } from "./javascript-scopes.ts";

Then("function parameter names in {string} are {string} for this source:", async function (path, expected, source) {
  await Promise.all([loadLanguage("embedded.js","auto"),loadLanguage("embedded.ts","auto")]);
  const state=EditorState.create({doc:source,extensions:[await loadLanguage(path,"auto")]});
  const tree=ensureSyntaxTree(state,state.doc.length,1000)??syntaxTree(state);
  const parameters=javascriptFunctionParameters(tree,state.doc);
  assert.equal(javascriptFunctionParameters(tree,state.doc),parameters);
  assert.deepEqual(parameters.map(range=>source.slice(range.from,range.to)),expected?expected.split(/\s+/):[]);
  for(let index=0;index<parameters.length;index++){
    assert.ok(parameters[index].to>parameters[index].from);
    if(index)assert.ok(parameters[index].from>=parameters[index-1].to,"Parameter ranges never overlap");
  }
});

Then("function parameter analysis shares scope caches without confusing document identities",async function(){
  const source="function example(Math) { return Math; }";
  const state=EditorState.create({doc:source,extensions:[await loadLanguage("main.js","auto")]});
  const tree=ensureSyntaxTree(state,state.doc.length,1000);
  const names=javascriptScopeNames(tree,state.doc),parameters=javascriptFunctionParameters(tree,state.doc);
  assert.equal(javascriptScopeNames(tree,state.doc),names);
  assert.equal(javascriptFunctionParameters(tree,state.doc),parameters);
  const other=Text.of([source.replaceAll("Math","Date")]);
  const updated=javascriptFunctionParameters(tree,other);
  assert.notEqual(updated,parameters);
  assert.deepEqual(updated.map(range=>other.sliceString(range.from,range.to)),["Date","Date"]);
});

Then("method parameter names in {string} are {string} for this source:", async function(path,expected,source){
  const state=EditorState.create({doc:source,extensions:[await loadLanguage(path,"auto")]});
  const tree=ensureSyntaxTree(state,state.doc.length,1000)??syntaxTree(state);
  assert.deepEqual(javascriptMethodParameters(tree,state.doc).map(range=>source.slice(range.from,range.to)),expected.split(/\s+/));
});
