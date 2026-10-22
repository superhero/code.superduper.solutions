// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { EditorState } from "@codemirror/state";
import { LanguageSupport, ensureSyntaxTree, foldable, getIndentation, indentUnit } from "@codemirror/language";
import { highlightTree, classHighlighter } from "@lezer/highlight";
import { intelligenceLanguage } from "../intelligence/catalog.ts";
import { formatterFor } from "../formatting/routing.ts";
import { optionalSyntax } from "../syntax/catalog.ts";
import { LANGUAGE_OPTIONS, languageDescriptions, loadLanguage, languageForPath, mappedLanguageForPath, normalizeLanguageMappings, relevantLanguageMappings, DEFAULT_LANGUAGE_MAPPINGS } from "./languages.ts";
import { DEFAULT_SETTINGS, normalizeOverrides, normalizeSettings, resolveSettings } from "./settings.ts";

Then("the catalog provides at least 50 usable local syntax modes", async function () {
  const modes = LANGUAGE_OPTIONS.filter(option => !["auto", "text"].includes(option.id));
  assert.ok(modes.length >= 50);
  assert.equal(modes.length, languageDescriptions.length + optionalSyntax.length, "Every descriptor has its own preference");
  assert.equal(new Set(LANGUAGE_OPTIONS.map(option => option.id)).size, LANGUAGE_OPTIONS.length);
  for (const { id } of modes) {
    assert.equal(normalizeOverrides({ languageMappings: {".sample":id} }).languageMappings[".sample"], id);
    if (optionalSyntax.some(item=>item.id===id)) {
      assert.deepEqual(await loadLanguage("",id), [], "Optional syntax stays disabled");
      continue;
    }
    const support = await loadLanguage("", id);
    assert.ok(support instanceof LanguageSupport, `Missing parser for ${id}`);
    const state = EditorState.create({ doc: "sample = 123\n", extensions: support });
    assert.equal(state.doc.toString(), "sample = 123\n");
  }
});

Then("syntax loading caches parsers and preserves explicit choices", async function () {
  const python = loadLanguage("first.py", "auto");
  assert.equal(python, loadLanguage("second.PY", "auto"));
  assert.equal(python, loadLanguage("notes.txt", "python"));
  assert.deepEqual(await loadLanguage("source.py", "text"), []);
  assert.deepEqual(await loadLanguage("notes.unknown", "auto"), []);
  assert.deepEqual(await loadLanguage("notes.txt", "invalid-mode"), []);
  assert.equal(loadLanguage("App.JSX", "auto"), loadLanguage("", "jsx"));
  assert.equal(loadLanguage("App.TSX", "auto"), loadLanguage("", "tsx"));
  assert.notEqual(loadLanguage("App.tsx", "javascript"), loadLanguage("App.tsx", "auto"));
  assert.equal(loadLanguage("App.svelte", "text"), loadLanguage("notes.txt", "text"));
});

Then("GraphQL and WGSL provide structured syntax highlighting without language engines", async function () {
  for(const [path,doc] of [
    ["query.graphql",'query Find($id: ID!) { user(id: $id) { name } }'],
    ["shader.wgsl",'@vertex fn main() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0); }']
  ]) {
    const support=await loadLanguage(path,"auto");
    const state=EditorState.create({doc,extensions:support});
    const tree=ensureSyntaxTree(state,doc.length,1000);
    assert.ok(tree && tree.length===doc.length);
    let nodes=0,errors=0;tree.iterate({enter(node){nodes++;if(node.type.isError)errors++;}});
    assert.ok(nodes>10, `Structured syntax for ${path}`);assert.equal(errors,0,`${path} parses cleanly`);
  }
});
Then("optional syntax choices preserve repository inheritance and reject unknown packages", function () {
  const settings=normalizeSettings({global:{syntaxPackages:{hcl:true,"handlebars-beta":false,unknown:true}},repositories:{one:{syntaxPackages:{hcl:false}},two:{syntaxPackages:{}}}});
  assert.deepEqual(settings.global.syntaxPackages,{hcl:true,"handlebars-beta":false});
  assert.deepEqual(resolveSettings(settings,"one").syntaxPackages,{hcl:false,"handlebars-beta":false});
  assert.deepEqual(resolveSettings(settings,"two").syntaxPackages,{hcl:true,"handlebars-beta":false});
  assert.deepEqual(normalizeOverrides({syntaxPackages:{hcl:"enabled"}}).syntaxPackages,{});
});

Then("Handlebars expressions HTML and comments parse locally with folding and indentation", async function () {
  const support=await loadLanguage("template.hbs","auto");
  const samples=[
    '<article class="card">{{title}} {{{body}}}</article>',
    '{{#if ready}}\n<p>{{user.name}}</p>\n{{else}}\n<p>Waiting</p>\n{{/if}}',
    '{{#each items}}\n{{@index}} {{../title}}\n{{/each}}',
    '{{> card title="Example"}}',
    '{{{{raw}}}}\n{{#if ignored}}\n{{{{/raw}}}}',
    '{{helper (other value) enabled=true count=2}}',
    '{{! comment }}\n{{!-- longer comment --}}',
    '{{~#unless ready~}}\ntext\n{{~/unless~}}'
  ];
  for(const doc of samples){
    const state=EditorState.create({doc,extensions:[support,indentUnit.of('  ')]});
    const tree=ensureSyntaxTree(state,doc.length,1000);let errors=0;
    tree.iterate({enter(node){if(node.type.isError)errors++;}});
    assert.equal(errors,0,doc);
  }
  const doc='{{#if ready}}\n  {{#each items}}\n    {{name}}\n  {{/each}}\n{{else}}\n  Waiting\n{{/if}}';
  const state=EditorState.create({doc,extensions:[support,indentUnit.of('  ')]});
  ensureSyntaxTree(state,doc.length,1000);
  const folded=foldable(state,0,state.doc.line(1).to);
  assert.deepEqual(folded,{from:state.doc.line(1).to,to:state.doc.line(7).from});
  assert.equal(getIndentation(state,state.doc.line(2).from),2);
  assert.equal(getIndentation(state,state.doc.line(3).from),4);
  assert.equal(getIndentation(state,state.doc.line(4).from),2);
  assert.equal(getIndentation(state,state.doc.line(5).from),0);
  assert.equal(getIndentation(state,state.doc.line(6).from),2);
  assert.equal(getIndentation(state,state.doc.line(7).from),0);
  const comment='{{!-- {{#if ignored}} --}}\nplain';
  assert.equal(foldable(EditorState.create({doc:comment,extensions:support}),0,comment.indexOf('\n')),null);
  const raw='{{{{raw}}}}\n{{#if ignored}}\n{{{{/raw}}}}';
  assert.equal(foldable(EditorState.create({doc:raw,extensions:support}),raw.indexOf('\n')+1,raw.lastIndexOf('\n')),null);
  const partial='{{#> layout}}\n<p>Content</p>\n{{/layout}}';
  const partialState=EditorState.create({doc:partial,extensions:support});
  const partialTree=ensureSyntaxTree(partialState,partial.length,1000);
  assert.equal(partialTree.length,partial.length);
  assert.equal(partialState.doc.toString(),partial,'Unsupported syntax must remain editable and intact');
});

Then("Makefile targets comments and recipes have local syntax support", async function () {
  const support=await loadLanguage("Makefile","auto");
  assert.equal(loadLanguage("rules.mk","auto"),loadLanguage("Makefile","auto"));
  const doc='# Build the application\napp: main.c\n\tcc main.c -o app\n';
  const state=EditorState.create({doc,extensions:support});
  const tree=ensureSyntaxTree(state,doc.length,1000);let errors=0;
  tree.iterate({enter(node){if(node.type.isError)errors++;}});assert.equal(errors,0);
  const spans=[];highlightTree(tree,classHighlighter,(from,to)=>spans.push(doc.slice(from,to)));
  assert.ok(spans.includes('# Build the application'));assert.ok(spans.includes('app'));
  assert.equal(state.doc.toString(),doc,'Loading syntax preserves recipe tabs');
  const fenced='```makefile\n'+doc+'```';
  const markdownState=EditorState.create({doc:fenced,extensions:await loadLanguage("README.md","auto")});
  let markdownTree=ensureSyntaxTree(markdownState,fenced.length,1000);
  // Markdown requests lazy fenced languages while parsing.
  markdownTree=ensureSyntaxTree(markdownState,fenced.length,1000);
  const inner=markdownTree.resolveInner(fenced.indexOf('app:'),1);
  assert.notEqual(inner.name,'CodeText','The fenced block uses its Makefile parser');
});

Then("filename mappings normalize safely and choose the longest matching suffix", async function () {
  const mappings=normalizeLanguageMappings({'*.TS':'python','test.ts':'json','.custom':'javascript','.bad':'auto','../escape':'python','foo/bar':'python','.':'python','a b':'python','.other':'unknown'});
  assert.deepEqual(mappings,{'.ts':'python','.test.ts':'json','.custom':'javascript'});
  assert.equal(languageForPath('src/TEST.TS','auto',mappings),'python');
  assert.equal(languageForPath('src/a.TEST.TS','auto',mappings),'json');
  assert.equal(languageForPath('src/custom.py','auto',mappings),'python');
  assert.equal(languageForPath('src/.ts/README','auto',mappings),'text');
  assert.equal(languageForPath('Dockerfile','auto',mappings),'dockerfile');
  assert.equal(languageForPath('Makefile','auto',mappings),'makefile');
  assert.equal(languageForPath('src/test.ts','auto',{'.ts':'text'}),'text');
  assert.equal(loadLanguage('example.custom','auto',{},mappings),loadLanguage('example.js','auto'));
  for(const [suffix,id]of Object.entries(DEFAULT_LANGUAGE_MAPPINGS))assert.equal(languageForPath('sample'+suffix,'auto'),id,suffix);
});
Then("filename mappings inherit by suffix and route engines and formatters consistently", function () {
  const store=normalizeSettings({global:{languageMappings:{'.code':'javascript','.js':'python'}},repositories:{one:{languageMappings:{'.js':'text','.tsx':'tsx'}},two:{languageMappings:{'.other':'json'}}},files:{one:{'a.code':{languageMappings:{'.code':'rust'},language:'rust'}}}});
  assert.deepEqual(store.files.one['a.code'],{});
  assert.deepEqual(resolveSettings(store,'one').languageMappings,{'.code':'javascript','.js':'text','.tsx':'tsx'});
  assert.equal(resolveSettings(store,'two').languageMappings['.js'],'python');
  const mode=mappedLanguageForPath('a.code',resolveSettings(store,'one').languageMappings);
  assert.equal(intelligenceLanguage('a.code',mode,'text'),'javascript');
  assert.equal(formatterFor('a.code',mode).plugin,'typescript');
  assert.equal(intelligenceLanguage('a.tsx','tsx','tsx'),'typescript');
  assert.equal(formatterFor('a.js','text'),undefined);
  assert.equal(mappedLanguageForPath('Dockerfile',{}),undefined);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(store))),store);
});

Then("filename mapping choices show only relevant repository suffixes", function () {
  assert.deepEqual(relevantLanguageMappings([]), {});
  const common = relevantLanguageMappings(undefined);
  for (const suffix of [".js", ".ts", ".html", ".json", ".xml"]) assert.ok(common[suffix]);
  assert.equal(common[".rs"], undefined);
  const result = relevantLanguageMappings(["src/APP.TS", "test/app.test.ts", "data.custom", "README", "Makefile"], {".test.ts":"javascript", ".custom":"python", ".unused":"rust"});
  assert.deepEqual(Object.keys(result).sort(), [".custom", ".test.ts", ".ts"]);
  assert.equal(result[".test.ts"], "javascript");
  assert.equal(result[".custom"], "python");
  assert.equal(relevantLanguageMappings(["unknown.xyzzy"])[".xyzzy"], "text");
});

Then("all syntax languages support disabling and repository overrides", async function () {
  const modes=LANGUAGE_OPTIONS.filter(item=>!['auto','text'].includes(item.id));
  const disabled=Object.fromEntries(modes.map(item=>[item.id,false]));
  const store=normalizeSettings({global:{syntaxPackages:disabled},repositories:{one:{syntaxPackages:{javascript:true}}}});
  assert.deepEqual(store.global.syntaxPackages,{...DEFAULT_SETTINGS.syntaxPackages,...disabled});
  assert.equal(resolveSettings(store,'one').syntaxPackages.javascript,true);
  assert.equal(resolveSettings(store,'two').syntaxPackages.javascript,false);
  for(const item of modes)assert.deepEqual(await loadLanguage('example',item.id,disabled),[],item.id);
  assert.deepEqual(await loadLanguage('example.jsx','auto',{jsx:false}),[]);
  assert.deepEqual(await loadLanguage('example.tsx','auto',{tsx:false}),[]);
  const {language}=await import('@codemirror/language');
  const support=await loadLanguage('example.md','auto',{javascript:false});
  const state=EditorState.create({doc:'# Heading',extensions:support});
  assert.ok(state.facet(language));
});
