// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { formatterFor } from "./routing.ts";
import { resolveFormattingConfiguration } from "./configuration.ts";

const resolve = (files, path = "src/main.ts", engine = "dprint") =>
  resolveFormattingConfiguration(Object.keys(files), async name => files[name], path, engine);
const json = JSON.stringify;

Then("missing formatter configuration resolves without reading unrelated files", async () => {
  const unread = async () => { throw new Error("Unrelated file was read"); };
  assert.deepEqual(await resolveFormattingConfiguration(["README.md", "src/main.ts"], unread, "src/main.ts", "dprint"), {});
  assert.deepEqual(await resolveFormattingConfiguration(["nested/.prettierrc"], unread, "page.html", "prettier"), {});
  assert.deepEqual(await resolve({ "package.json": '{"name":"example"}' }, "page.html", "prettier"), {});
  assert.deepEqual(await resolve({ "package.json": '{"prettier":null}' }, "page.html", "prettier"), {});
});

Then("nearest dprint configuration keeps global and plugin options without loading plugins", async () => {
  const files = {
    "dprint.json": '{"lineWidth":120,"typescript":{"semiColons":"asi"}}',
    "src/.dprint.jsonc": '{ // comments and trailing commas are data\n "lineWidth":88,"typescript":{"quoteStyle":"preferSingle"},"plugins":["https://example.invalid/plugin.wasm"],"$schema":"https://example.invalid/schema.json",}',
  };
  const reads = [];
  const result = await resolveFormattingConfiguration(Object.keys(files), async name => { reads.push(name); return files[name]; }, "src/deep/main.ts", "dprint");
  assert.deepEqual(reads, ["src/.dprint.jsonc"]);
  assert.deepEqual(result, { dprint: { lineWidth: 88, typescript: { quoteStyle: "preferSingle" } } });
  for (const name of ["dprint.json", ".dprint.json", "dprint.jsonc", ".dprint.jsonc"]) {
    assert.deepEqual(await resolve({ [name]: '{"indentWidth":4,"inherit":false}' }), { dprint: { indentWidth: 4 } });
  }
  assert.deepEqual(await resolve({ "dprint.json": '{"lineWidth":100}', ".dprint.json": '{"lineWidth":80}' }), { dprint: { lineWidth: 100 } });
});

Then("dprint file filters honor relative globs negation and directories", async () => {
  const files = { "src/dprint.json": json({ includes: ["**/*.{ts,js}", "!**/*.generated.ts"], excludes: ["vendor/", "**/*-lock.{js,ts}", "*.skip.ts", "!keep.skip.ts"] }) };
  assert.deepEqual(await resolve(files, "src/deep/main.ts"), { dprint: {} });
  assert.deepEqual(await resolve(files, "src/deep/keep.skip.ts"), { dprint: {} });
  for (const path of ["src/main.css", "src/deep/main.generated.ts", "src/vendor/main.ts", "src/deep/main-lock.js", "src/deep/main.skip.ts"]) {
    await assert.rejects(resolve(files, path), /Formatting excluded.*src\/dprint.json/);
  }
  assert.deepEqual(await resolve({ "dprint.json": '{"includes":["!*.generated.ts"]}' }), { dprint: {} });
  await assert.rejects(resolve({ "dprint.json": '{"includes":[]}' }), /does not match includes/);
  assert.deepEqual(await resolve({ "dprint.json": '{"includes":["/src/*.ts"]}' }), { dprint: {} });
  await assert.rejects(resolve({ "dprint.json": '{"includes":["./main.ts"]}' }), /Formatting excluded/);
});

Then("prettier data configurations resolve from supported filenames", async () => {
  for (const name of [".prettierrc", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml"]) {
    assert.deepEqual(await resolve({ [name]: '{"tabWidth":4,"singleQuote":true,"$schema":"ignored"}' }, "page.html", "prettier"), { prettier: { tabWidth: 4, singleQuote: true } });
  }
  assert.deepEqual(await resolve({ ".prettierrc": "tabWidth: 3\nuseTabs: false\n" }, "page.html", "prettier"), { prettier: { tabWidth: 3, useTabs: false } });
  assert.deepEqual(await resolve({ ".prettierrc.json": '\uFEFF{"tabWidth":4}' }, "page.html", "prettier"), { prettier: { tabWidth: 4 } });
});

Then("prettier resolves nearest configuration and package options", async () => {
  const files = { ".prettierrc": '{"tabWidth":8,"printWidth":100}', "src/.prettierrc.yaml": "tabWidth: 4", "src/package.json": '{"name":"example"}' };
  assert.deepEqual(await resolve(files, "src/deep/page.html", "prettier"), { prettier: { tabWidth: 4 } });
  files["src/package.json"] = '{"prettier":{"useTabs":true}}';
  assert.deepEqual(await resolve(files, "src/deep/page.html", "prettier"), { prettier: { useTabs: true } });
  assert.deepEqual(await resolve(files, "page.html", "prettier"), { prettier: { tabWidth: 8, printWidth: 100 } });
  assert.deepEqual(await resolve({ "src/package.json": "{}", ".prettierrc": '{"tabWidth":2}' }, "src/page.html", "prettier"), { prettier: { tabWidth: 2 } });
});

Then("prettier overrides match basenames relative paths and exclusions", async () => {
  const files = { "src/.prettierrc": json({ tabWidth: 2, overrides: [
    { files: "*.html", options: { tabWidth: 4 } },
    { files: ["pages/**/*.html", "*.css"], excludeFiles: "*.generated.html", options: { printWidth: 90 } },
    { files: "pages/*.html", excludeFiles: ["pages/legacy.html"], options: { tabWidth: 6 } },
    { files: "./root.html", options: { tabWidth: 8 } },
  ] }) };
  assert.deepEqual(await resolve(files, "src/pages/index.html", "prettier"), { prettier: { tabWidth: 6, printWidth: 90 } });
  assert.deepEqual(await resolve(files, "src/pages/deep/index.html", "prettier"), { prettier: { tabWidth: 4, printWidth: 90 } });
  assert.deepEqual(await resolve(files, "src/pages/legacy.html", "prettier"), { prettier: { tabWidth: 4, printWidth: 90 } });
  assert.deepEqual(await resolve(files, "src/pages/deep/index.generated.html", "prettier"), { prettier: { tabWidth: 4 } });
  assert.deepEqual(await resolve(files, "src/root.html", "prettier"), { prettier: { tabWidth: 8 } });
  assert.deepEqual(await resolve(files, "src/theme.css", "prettier"), { prettier: { tabWidth: 2, printWidth: 90 } });
});

Then("prettier ignore rules preserve escaped names negation and directory exclusions", async () => {
  const files = { ".prettierignore": "# comment\ngenerated/\n!generated/keep.html\n*.generated.html\n!keep.generated.html\n/root.html\n\\#literal.html\n\\!literal.html\n", ".prettierrc": "tabWidth: 2" };
  for (const path of ["generated/page.html", "generated/keep.html", "src/page.generated.html", "root.html", "#literal.html", "!literal.html"]) {
    await assert.rejects(resolve(files, path, "prettier"), /Formatting excluded.*\.prettierignore/);
  }
  for (const path of ["src/root.html", "src/keep.generated.html", "src/Generated/page.html"]) {
    assert.deepEqual(await resolve(files, path, "prettier"), { prettier: { tabWidth: 2 } });
  }
  assert.deepEqual(await resolve({ ".prettierignore": "*.ts" }), {});
});

Then("malformed formatter data and option structures are rejected", async () => {
  for (const [name, contents, engine] of [
    ["dprint.json", '{"indentWidth":}', "dprint"],
    [".prettierrc.json", '{"tabWidth":4,}', "prettier"],
    [".prettierrc.yaml", "tabWidth: [", "prettier"],
    [".prettierrc", "tabWidth: 2\ntabWidth: 4", "prettier"],
    [".prettierrc", "tabWidth: !custom 4", "prettier"],
  ]) await assert.rejects(resolve({ [name]: contents }, "file.html", engine), /Invalid formatting configuration.*malformed/);
  for (const value of [null, [], 7, true]) await assert.rejects(resolve({ "dprint.json": json(value) }), /expected an options object/);
  for (const includes of [null, {}, [null], [""], ["x".repeat(1025)]]) await assert.rejects(resolve({ "dprint.json": json({ includes }) }), /file patterns/);
  for (const config of [{ overrides: {} }, { overrides: [null] }, { overrides: [{ files: 1, options: {} }] }, { overrides: [{ files: "*.html", options: [] }] }]) {
    await assert.rejects(resolve({ ".prettierrc": json(config) }, "file.html", "prettier"), /Invalid formatting configuration/);
  }
});

Then("executable prettier configurations are rejected before their contents are read", async () => {
  for (const extension of ["js", "mjs", "cjs", "ts", "mts", "cts"]) for (const basename of [".prettierrc", "prettier.config"]) {
    const filename = `src/${basename}.${extension}`;
    const reads = [];
    await assert.rejects(resolveFormattingConfiguration([filename, ".prettierrc"], async name => { reads.push(name); return "globalThis.formatterConfigExecuted = true"; }, "src/page.html", "prettier"), /executable config requires Node/);
    assert.deepEqual(reads, []);
  }
  for (const extension of ["json5", "toml"]) await assert.rejects(resolve({ [`.prettierrc.${extension}`]: "" }, "page.html", "prettier"), /config format is unsupported/);
});

Then("external formatter configs and inheritance are rejected explicitly", async () => {
  for (const extendsValue of ["https://example.invalid/config.json", "./base.json", ["base.json"]]) {
    await assert.rejects(resolve({ "dprint.json": json({ extends: extendsValue }) }), /extends is unsupported.*network/);
  }
  await assert.rejects(resolve({ "dprint.json": '{"inherit":true}' }), /inherit is unsupported/);
  await assert.rejects(resolve({ ".prettierrc": '"@example/config"' }, "page.html", "prettier"), /shared config imports require Node/);
  await assert.rejects(resolve({ "package.json": '{"prettier":"@example/config"}' }, "page.html", "prettier"), /shared config imports require Node/);
  await assert.rejects(resolve({ ".prettierrc": '{"extends":"./base.json"}' }, "page.html", "prettier"), /extends is unsupported/);
  await assert.rejects(resolve({ ".prettierrc": '{"overrides":[{"files":"*.html","options":{"extends":"./base.json"}}]}' }, "page.html", "prettier"), /extends is unsupported/);
});

Then("prettier accepts only bundled plugin declarations and rejects custom compiler paths", async () => {
  const plugins = ["prettier-plugin-svelte", "@prettier/plugin-xml", "prettier/plugins/html"];
  assert.deepEqual(await resolve({ ".prettierrc": json({ plugins, tabWidth: 4 }) }, "page.svelte", "prettier"), { prettier: { tabWidth: 4 } });
  assert.deepEqual(await resolve({ ".prettierrc": '{"plugins":[]}' }, "page.html", "prettier"), { prettier: {} });
  for (const plugin of ["./evil.js", "https://example.invalid/evil.js", "other-plugin"]) {
    await assert.rejects(resolve({ ".prettierrc": json({ plugins: [plugin] }) }, "page.html", "prettier"), /repository plugin code cannot run/);
  }
  await assert.rejects(resolve({ ".prettierrc": '{"svelte5CompilerPath":"./evil.js"}' }, "page.svelte", "prettier"), /svelte5CompilerPath is unsupported/);
});

Then("prettier parser options survive while path and partial formatting controls are rejected", async () => {
  assert.deepEqual(await resolve({ ".prettierrc": '{"overrides":[{"files":"*.svelte","options":{"parser":"svelte"}}]}' }, "page.svelte", "prettier"), { prettier: { parser: "svelte" } });
  for (const key of ["filepath", "rangeStart", "rangeEnd", "cursorOffset"]) {
    await assert.rejects(resolve({ ".prettierrc": json({ [key]: 0 }) }, "page.html", "prettier"), new RegExp(`${key} is unsupported`));
  }
});

Then("formatter configuration rejects oversized cyclic and unsafe structures", async () => {
  await assert.rejects(resolve({ "dprint.json": " ".repeat(65_537) }), /size limit/);
  await assert.rejects(resolve({ ".prettierrc": "options: &loop\n  options: *loop" }, "page.html", "prettier"), /cyclic YAML aliases/);
  await assert.rejects(resolve({ ".prettierrc": "options: !!set\n  value: null" }, "page.html", "prettier"), /only data objects/);
  await assert.rejects(resolve({ "dprint.json": '{"typescript":{"__proto__":{"unsafe":true}}}' }), /only data objects/);
  await assert.rejects(resolve({ ".prettierrc.json": '{"__proto__":{"unsafe":true}}' }, "page.html", "prettier"), /unsafe object key/);
  let deep = {};
  for (let index = 0; index < 33; index++) deep = { nested: deep };
  await assert.rejects(resolve({ "dprint.json": json(deep) }), /nesting depth/);
});

Then("Roslyn is selected for C sharp and Visual Basic filenames and overrides", async () => {
  for (const [path, language, extension] of [
    ["src/Program.cs", undefined, "cs"], ["src/PROGRAM.CS", "auto", "cs"],
    ["src/Module.vb", undefined, "vb"], ["code.txt", "csharp", "cs"],
    ["code.txt", "vb-net", "vb"], ["code.txt", "vb.net", "vb"],
  ]) assert.deepEqual(formatterFor(path, language), { engine: "dprint", plugin: "roslyn", label: "Roslyn (dprint)", extension });
  assert.equal(formatterFor("Program.cs", "text"), undefined);
  assert.deepEqual(await resolve({ "dprint.json": '{"indentWidth":4,"roslyn":{"csharp.spaceAfterComma":false}}' }, "src/Program.cs"),
    { dprint: { indentWidth: 4, roslyn: { "csharp.spaceAfterComma": false } } });
});

Then("Jupyter filenames select notebook formatting while explicit JSON still overrides it", () => {
  assert.deepEqual(formatterFor("notebooks/Example.IPYNB"), { engine: "dprint", plugin: "jupyter", label: "dprint", extension: "ipynb" });
  assert.equal(formatterFor("notebook.ipynb", "json").plugin, "json");
  assert.equal(formatterFor("notebook.ipynb", "text"), undefined);
});
Then('fourmolu resolves nearest YAML printer options without native project configuration',async()=>{
  assert.deepEqual(await resolve({'fourmolu.yaml':'indentation: 4\n','src/fourmolu.yaml':'indentation: 6\ncomma-style: leading\n'},'src/Main.hs','fourmolu'),{fourmolu:{indentation:6,'comma-style':'leading'}});
  assert.deepEqual(await resolve({},'Main.hs','fourmolu'),{});
  assert.equal(formatterFor('Main.hs').engine,'fourmolu');
  assert.equal(formatterFor('Example.hsig').extension,'hsig');
  assert.equal(formatterFor('Main.hs','auto',{haskell:'none'}),undefined);
  assert.equal(formatterFor('Main.lhs'),undefined);
  for(const key of ['fixities','local-modules','reexports','ghc-opt'])await assert.rejects(resolve({'fourmolu.yaml':`${key}: []`},'Main.hs','fourmolu'),/unsupported by the browser build/);
  await assert.rejects(resolve({'fourmolu.yaml':'indentation: [broken'},'Main.hs','fourmolu'),/malformed YAML/);
});
