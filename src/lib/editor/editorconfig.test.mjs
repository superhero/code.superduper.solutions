// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { parseEditorConfig, resolveFileConfiguration } from "./editorconfig.ts";
import { DEFAULT_SETTINGS } from "./settings.ts";
const resolve = (files, selected, inherited) => resolveFileConfiguration(Object.keys(files), async path => files[path], selected, inherited);
Then("nested editor configuration resolves matching sections and unset values", async () => {
  const files = {
    '.editorconfig': '# comment\n; other\n\nROOT = true\n[*]\nindent_style=space\nindent_size=2\ntab_width=3\n[/src/*.{ts,js}]\nindent_size=4\n[*.txt]\nindent_size=8',
    'src/.editorconfig': '[*.ts]\nindent_size=unset\ntab_width=6\n[deep/*.ts]\nindent_size=5',
  };
  assert.deepEqual(await resolve(files, 'src/main.ts'), {indentWithTabs:false, tabSize:6});
  assert.deepEqual(await resolve(files, 'src/deep/main.ts'), {indentWithTabs:false, indentSize:5, tabSize:6});
  assert.deepEqual(await resolve(files, 'file.txt'), {indentWithTabs:false, indentSize:8, tabSize:3});
  assert.equal(parseEditorConfig('[*.js]\nindent_size=2\n[*.js]\nindent_size=4', 'nested/.hidden.js').properties.indent_size, '4');
});
Then("nested root editor configuration stops parent reads", async () => {
  const paths=['.editorconfig','src/.editorconfig','src/sub/.editorconfig'];
  const reads=[];
  const result=await resolveFileConfiguration(paths, async path => {reads.push(path); if(path==='src/sub/.editorconfig')return '[*]\nindent_style=tab'; if(path==='src/.editorconfig')return 'root=true\n[*]\ntab_width=4'; throw Error('Parent must not be read');}, 'src/sub/x.ts');
  assert.deepEqual(reads,['src/sub/.editorconfig','src/.editorconfig']);
  assert.deepEqual(result,{indentWithTabs:true, indentSize:4, tabSize:4});
});
Then("tab indentation configuration resolves fallback widths", async () => {
  assert.deepEqual(await resolve({'.editorconfig':'[*]\nindent_size=tab'},'x', {...DEFAULT_SETTINGS,tabSize:6}), {indentSize:6,tabSize:6});
  assert.deepEqual(await resolve({'.editorconfig':'[*]\nindent_style=tab'},'x'), {indentWithTabs:true,indentSize:DEFAULT_SETTINGS.tabSize,tabSize:DEFAULT_SETTINGS.tabSize});
  assert.deepEqual(await resolve({'.editorconfig':'[*]\nindent_size=4'},'x'), {indentSize:4,tabSize:4});
  assert.deepEqual(await resolve({'.editorconfig':'[*]\nindent_size=tab\ntab_width=3'},'x'), {indentSize:3,tabSize:3});
  assert.deepEqual(await resolve({'.editorconfig':'[*]\nindent_size=4\nindent_style=tab'},'x'), {indentWithTabs:true,indentSize:4,tabSize:4});
});
Then("malformed editor configuration is rejected and unknown preferences ignored", async () => {
  assert.throws(()=>parseEditorConfig('invalid', 'x'),/key=value/);
  assert.throws(()=>parseEditorConfig('['+'x'.repeat(1025)+']', 'x'),/1024/);
  assert.throws(()=>parseEditorConfig('x'.repeat(65_537), 'x'),/size limit/);
  assert.equal(Object.keys(parseEditorConfig('[{1..999999999}]\nindent_size=2', 'x').properties).length,0);
  assert.deepEqual(await resolve({'.editorconfig':'root=false\nindent_size=8\n[*]\nindent_style=banana\nindent_size=2 # no inline comment\ntab_width=900\ncharset=latin1\ntrim_trailing_whitespace=true'},'x'),{});
  assert.deepEqual(await resolve({'.editorconfig':'[*]\nindent_style=tab\nindent_size=banana'},'x'),{indentWithTabs:true});
});
Then("missing editor configuration leaves settings unchanged", async () => {
  assert.deepEqual(await resolve({}, 'src/file.ts'), {});
  assert.deepEqual(await resolve({'.editorconfig':''}, 'file.ts'), {});
  assert.deepEqual(await resolve({'.editorconfig':'[*]\nindent_style=unset\ntab_width=unset'}, 'file.ts'), {});
});
