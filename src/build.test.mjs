// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readdir, readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { Given, Then } from "@cucumber/cucumber";
import { parseAst } from "vite";
import { createFromBuffer } from "@dprint/formatter";
import { collectInlineWorkerLicenses, embedLicenseNotices, licenseInventoryFile, renderLicenseNotices } from "../build/license-notices.mjs";
import { faviconFiles } from "../build/favicons.mjs";

async function publishedPackageBytes(item) {
  return Buffer.concat(await Promise.all((item.parts ?? [{url:item.url}]).map(part => readFile(`dist/${part.url.slice(2)}`))));
}

Then('every static download fits Pages and large optional packages retain verified parts', {timeout:30_000}, async function () {
  const files = await readdir('dist', {recursive:true, withFileTypes:true});
  for (const file of files.filter(file => file.isFile())) {
    const bytes = await readFile(join(file.parentPath, file.name));
    assert.ok(bytes.length <= 25 * 1024 * 1024, file.name);
  }
  const formatters = await (await import('../build/formatter-packages.mjs')).createFormatterPackages();
  const languages = await (await import('../build/language-packages.mjs')).createLanguagePackages();
  const split = [...formatters.catalog, ...languages.catalog].filter(item => item.parts);
  assert.deepEqual(split.map(item => item.id).sort(), ['dprint-roslyn','fourmolu','toml']);
  for (const item of split) {
    assert.equal(item.parts.reduce((total, part) => total + part.bytes, 0), item.bytes);
    for (const part of item.parts) {
      const bytes = await readFile(`dist/${part.url.slice(2)}`);
      assert.equal(bytes.length, part.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), part.sha256);
    }
    assert.equal(createHash('sha256').update(await publishedPackageBytes(item)).digest('hex'), item.sha256);
  }
});

Given("the production build has completed", async function () { this.html = await readFile("dist/index.html", "utf8"); });
Then('optional browser inference files retain pinned runtime bytes and publisher notices', async function () {
  const { ALL_MODEL_PROFILES, artifactsFor } = await import('./lib/assistant/browser/catalog.ts');
  const assets = new Map(ALL_MODEL_PROFILES.flatMap(profile => artifactsFor(profile).filter(file => file.url.startsWith('browser-models/')).map(file => [file.url,file])));
  for (const file of assets.values()) {
    const bytes = file.parts ? Buffer.concat(await Promise.all(file.parts.map(part => readFile('dist/' + part.url)))) : await readFile('dist/' + file.url);
    assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    if(file.kind==='runtime') assert.equal(this.html.includes(bytes.toString('base64')),false,'Optional runtime payload must stay outside core HTML');
  }
  assert.deepEqual((await readdir('dist/browser-models')).sort(),['notices','runtimes','wllama','wllama-d3','wllama-elephant','wllama-pplx-v3']);
  assert.deepEqual((await readdir('dist/browser-models/wllama')).sort(),['LICENCE','build-receipt.json','index.js','wllama.wasm']);
  const runtimes=JSON.parse(await readFile('src/lib/assistant/browser/runtime-artifacts.json'));
  for(const group of ['vision','strands-cpu','strands-gpu']){
    const file=runtimes[group].find(file=>file.id==='ort-mjs');
    assert.match(await readFile('dist/'+file.url,'utf8'),/webgpuInit/,`${group} requires the WebGPU-capable ORT factory`);
  }
});
Then('upstream integrations are self-contained verified packages with complete notices',async function(){
 const {catalog}=await(await import('../build/remote-packages.mjs')).createRemotePackages();assert.equal(catalog.length,3);
 for(const item of catalog){
  const bytes=await publishedPackageBytes(item);assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  const envelope=JSON.parse(bytes.toString()),payload=Buffer.from(envelope.payload,'base64').toString();
  assert.equal(envelope.id,item.id);assert.equal(envelope.version,item.version);assert.ok(!this.html.includes(envelope.payload));assert.ok(envelope.notices.some(notice=>notice.name.includes(item.id==='github'?'@octokit/rest':item.id==='gitlab'?'@gitbeaker/rest':'bitbucket')));
  assert.ok(envelope.notices.every(notice=>notice.text.trim().length>100));assert.ok(!parseAst(payload).body.some(node=>node.type==='ImportDeclaration'||node.source));
 }
});
Then("the formatter packages retain their WebAssembly notices in full", { timeout: 30_000 }, async function () {
  const { catalog, assets } = await (await import("../build/formatter-packages.mjs")).createFormatterPackages();
  const providers = JSON.parse(await readFile('src/lib/formatting/providers.json','utf8'));
  for (const definition of providers.filter(item=>item.engine==='dprint')) {
    const plugin = definition.plugin;
    const root = `node_modules/${definition.npm}`;
    const input = definition.npm ? await readFile(`${root}/plugin.wasm`)
      : (await (await import('../build/formatter-artifacts.mjs')).formatterArtifact(plugin)).bytes;
    const notice = createFromBuffer(input).getLicenseText().trim();
    const entry = catalog.find(item => item.id === `dprint-${plugin}`);
    const artifact = JSON.parse(Buffer.concat((entry.parts ?? [{url:entry.url}]).map(part => assets.get(part.url.slice(2)))).toString());
    assert.equal(artifact.notices[0].text,notice);
    if (plugin === 'clang-format') {
      const supplement = JSON.parse(await readFile('build/licenses/clang-format-0.1.0.json','utf8'));
      for(const dependency of supplement.notices) assert.equal(artifact.notices.find(item=>item.name===dependency.name)?.text,dependency.text);
    }
    if (plugin === "roslyn") {
      const supplemental = JSON.parse(await readFile("build/licenses/roslyn-0.23.2.json", "utf8"));
      for (const dependency of supplemental.notices) assert.equal(artifact.notices.find(item => item.name === dependency.name)?.text, dependency.text);
    }
    assert.ok(notice.length > 100);

    assert.ok(!this.html.includes(artifact.payload), "Optional Wasm must not be embedded in the main page");
  }
});
Then("optional formatter packages match their catalog and have no external module imports", { timeout: 30_000 }, async function () {
  const { createHash } = await import("node:crypto");
  const { catalog } = await (await import("../build/formatter-packages.mjs")).createFormatterPackages();
  const providers = JSON.parse(await readFile('src/lib/formatting/providers.json','utf8'));
  assert.equal(catalog.length, 38);
  assert.deepEqual(catalog.map(item=>item.id).sort(),providers.map(item=>item.id).sort());
  for (const item of catalog) {
    const bytes = await publishedPackageBytes(item);
    assert.equal(bytes.length, item.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256);
    const envelope = JSON.parse(bytes.toString());
    assert.equal(envelope.id, item.id);
    assert.equal(envelope.version, item.version);
    for(const resource of Object.values(envelope.resources??{}))assert.ok(WebAssembly.validate(Buffer.from(resource,'base64')));
    assert.ok(envelope.notices.every(notice => notice.text.trim().length > 100));
    const payload = Buffer.from(envelope.payload, "base64");
    assert.equal(payload.length, item.payloadBytes);
    if(item.id==='dockerfile-service') assert.doesNotMatch(payload.toString(),/auth\.docker\.io|registry-1\.docker\.io|node:https/);
    if (item.id === "fourmolu") {
      const supplement=JSON.parse(await readFile('build/licenses/fourmolu-0.21.0.0.json','utf8'));
      const wasm=Buffer.from(envelope.wasm,'base64');
      assert.equal(wasm.length,55005943);
      assert.equal(createHash("sha256").update(wasm).digest("hex"),supplement.wasmSha256);
      for(const notice of supplement.notices)assert.equal(envelope.notices.find(item=>item.name===notice.name&&item.version===notice.version)?.text,notice.text);
      assert.ok(!this.html.includes(envelope.wasm));
    }
    if (item.kind === "module") {
      const ast = parseAst(payload.toString());
      assert.ok(!ast.body.some(node => node.type === "ImportDeclaration" || node.source));
      assert.ok(!this.html.includes(envelope.payload), "Optional JavaScript must not be embedded in the main page");
    }
  }
});
Then("HTML examples in bundled scripts survive notice insertion", async function () {
  const script = '<script>globalThis.example = \'<script src="example.js"> </body>\';</script>';
  const html = { type: "asset", fileName: "index.html", source: `<body>${script}</body>` };
  const bundle = {
    "index.html": html,
    "index.js": { type: "chunk", fileName: "index.js", isEntry: true, imports: [], dynamicImports: [] },
    [licenseInventoryFile]: { type: "asset", source: JSON.stringify([{ name: "fixture", version: "1.0.0", text: "Fixture license" }]) }
  };
  await embedLicenseNotices().generateBundle.handler.call({ addWatchFile() {} }, {}, bundle);
  assert.ok(html.source.startsWith(`<body>${script}<template`));
  assert.ok(html.source.endsWith("</body>"));
  assert.equal(html.source.match(/<template id="license-notices"/g).length, 1);
});
Then("the worker inventory retains full licenses from its actual module graph", async function () {
  const entries = [];
  const watch = [];
  await collectInlineWorkerLicenses(entries).generateBundle.call({ addWatchFile: path => watch.push(path) }, {}, {
    "worker.js": { type: "chunk", moduleIds: [
      resolve("src/lib/repository/worker.ts"), "\0virtual-worker",
      resolve("node_modules/@isomorphic-git/lightning-fs/src/index.js"),
      resolve("node_modules/@isomorphic-git/lightning-fs/src/PromisifiedFS.js"),
      resolve("node_modules/isomorphic-git/index.js"),
    ] },
  });
  assert.equal(entries.length, 2);
  for (const name of ["@isomorphic-git/lightning-fs", "isomorphic-git"]) {
    const entry = entries.find(entry => entry.name === name);
    const filename = name === "isomorphic-git" ? "LICENSE.md" : "LICENSE";
    assert.equal(entry.text, await readFile(`node_modules/${name}/${filename}`, "utf8"));
    assert.ok(watch.includes(resolve(`node_modules/${name}/${filename}`)));
  }
});
Then("the worker packager rejects a {string} notice fallback", async function (failure) {
  const temporary = await mkdtemp(join(tmpdir(), "code-license-fallback-"));
  try {
    const directory = join(temporary, "node_modules", "diff3");
    await mkdir(directory, { recursive: true });
    const metadata = { name: "diff3", version: "0.0.3", license: "MIT" };
    if (failure === "changed version") metadata.version = "0.0.4";
    if (failure === "changed declaration") metadata.license = "ISC";
    await writeFile(join(directory, "package.json"), JSON.stringify(metadata));
    await writeFile(join(directory, "diff3.js"), "// An unreviewed replacement implementation and notice.\n");
    const expected = failure === "changed version" ? /Missing license notice text for diff3@0\.0\.4/
      : failure === "changed declaration" ? /License declaration changed/ : /License source changed/;
    const entries = [];
    await assert.rejects(collectInlineWorkerLicenses(entries).generateBundle.call({ addWatchFile() {} }, {}, {
      "worker.js": { type: "chunk", moduleIds: [join(directory, "diff3.js")] },
    }), expected);
    assert.deepEqual(entries, []);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
Then("an unaccounted worker inventory fails the build", async function () {
  await assert.rejects(collectInlineWorkerLicenses([]).generateBundle.call({ addWatchFile() {} }, {}, {
    "worker.js": { type: "chunk", moduleIds: [resolve("src/lib/repository/worker.ts")] },
  }), /worker dependency license inventory is empty/);
});
Then("the distribution contains only the page hosting headers and favicon assets", async function () {
  const files = await readdir('dist');
  assert.deepEqual(files.sort(), ["_headers", "index.html", "formatters", "languages", "syntax", "remotes", "types", "browser-models", "speech", ...faviconFiles,
    ...(files.includes('source.tar.gz') ? ['source.tar.gz'] : [])].sort());
});
Then("the hosting headers enable cross-origin isolation", async function () {
  const headers = await readFile("dist/_headers", "utf8");
  assert.match(headers, /^\/\*\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: credentialless\n$/);
});
Then("the built page has the code editor title and application mount target", function () {
  assert.match(this.html, /<title>code\.superduper\.solutions<\/title>/);
  assert.match(this.html, /<div\b[^>]*\bid=["']app["']/);
});
Then("the built page embeds its JavaScript and CSS without external entry assets", function () {
  assert.match(this.html, /<script\b[^>]*>.+<\/script>/s);
  assert.match(this.html, /<style\b[^>]*>.+<\/style>/s);
  const markup = this.html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, "$1</script>")
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style\s*>/gi, "$1</style>");
  assert.doesNotMatch(markup, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(markup, /<link\b[^>]*\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i);
});
Then("the production fonts are embedded rather than fetched remotely", function () {
  for (const family of ["Montserrat", "Rationale", "Material Symbols Rounded", "Devicon"]) assert.ok(this.html.includes(family), `Missing ${family} font.`);
  assert.match(this.html, /url\(["']?data:font\/woff2;base64,/);
  assert.match(this.html, /url\(["']?data:font\/woff;base64,/);
  assert.doesNotMatch(this.html, /url\(["']?(?:https?:|\/\/|[^)]*\.woff2?)/);
});
Then("the built page excludes development clients overlays and toolbars", function () {
  for (const marker of ["/@vite/client", "visulima:vite-overlay:error", "Runtime Error Overlay", "__visulima_overlay__", "<dev-toolbar", "dev-loading"]) {
    assert.ok(!this.html.includes(marker), `Development marker included: ${marker}`);
  }
});

Then("the embedded notice for {string} preserves {string} in full", async function (source, path) {
  if (source.startsWith("npm:")) {
    const metadata = JSON.parse(await readFile(`node_modules/${source.slice(4)}/package.json`, "utf8"));
    source += `@${metadata.version}`;
  }
  const records = [...this.html.matchAll(/<pre data-license-source="([^"]+)">([\s\S]*?)<\/pre>/g)];
  const matching = records.filter(record => record[1] === source);
  assert.equal(matching.length, 1, `Expected one notice for ${source}.`);
  const text = matching[0][2].replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
  assert.equal(text, (await readFile(path, "utf8")).trim());
});

Then("the packager rejects a {string} license inventory without altering the page", async function (failure) {
  const page = { type: "asset", fileName: "index.html", source: "<body></body>" };
  const bundle = { "index.html": page };
  const cases = {
    missing: { expected: /Missing Vite license inventory/ },
    empty: { entries: [], expected: /license inventory is empty/ },
    "missing text": { entries: [{ name: "fixture", version: "1.0.0", identifier: "MIT" }], expected: /Missing license notice text for fixture@1\.0\.0/ },
    "empty text": { entries: [{ name: "fixture", version: "1.0.0", text: " \n" }], expected: /Missing license notice text for fixture@1\.0\.0/ },
  };
  const { entries, expected } = cases[failure];
  if (entries) bundle[licenseInventoryFile] = { type: "asset", source: JSON.stringify(entries) };
  const original = structuredClone(bundle);
  await assert.rejects(embedLicenseNotices().generateBundle.handler.call({ addWatchFile() {} }, {}, bundle), expected);
  assert.deepEqual(bundle, original);
});

Then("notice markup is escaped without losing its original text", function () {
  const text = '</pre></template><script>globalThis.noticeExecuted = true</script><img src="https://notice.invalid/probe"> & copyright';
  const html = renderLicenseNotices([{ source: 'fixture:"<&', title: "Fixture <notice>", text }]);
  assert.doesNotMatch(html, /<script|<img|<notice>/);
  assert.equal((html.match(/<\/template>/g) ?? []).length, 1);
  const escaped = html.match(/<pre[^>]+>([\s\S]*?)<\/pre>/)[1];
  assert.equal(escaped.replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&"), text);
});

Then("the packager rejects {string} instead of discarding executable assets", async function (failure) {
  const chunk = { type: "chunk", fileName: "index.js", isEntry: true, imports: [], dynamicImports: [], code: "startApplication();" };
  const bundle = {
    "index.html": { type: "asset", fileName: "index.html", source: "<body><script>startApplication();</script></body>" },
    "index.js": chunk,
    [licenseInventoryFile]: { type: "asset", source: JSON.stringify([{ name: "fixture", version: "1.0.0", text: "MIT notice" }]) },
  };
  if (failure === "another executable chunk") bundle["worker.js"] = { ...chunk, fileName: "worker.js", isEntry: false, code: "runWorker();" };
  else if (failure === "an external import") chunk.imports.push("https://unexpected.invalid/runtime.js");
  else if (failure === "a dynamic import") chunk.dynamicImports.push("lazy.js");
  else if (failure === "a runtime self import") {
    chunk.dynamicImports.push(chunk.fileName);
    chunk.code = 'Promise.resolve().then(() => import("./index.js"));';
  }
  else if (failure === "an unowned blob import") {
    chunk.dynamicImports.push(chunk.fileName);
    chunk.code='let url; import(url=URL.createObjectURL(new Blob([payload],{type:"text/javascript"})));';
  }
  else if (failure === "an arbitrary syntax import") {
    chunk.dynamicImports.push(chunk.fileName);
    chunk.modules={"/project/src/lib/syntax/loader.ts":{}};
    chunk.code='import("https://unexpected.invalid/parser.js");';
  }
  else if (failure === "split stylesheets") {
    bundle["base.css"] = { type: "asset", source: "body{margin:0}" };
    bundle["lazy.css"] = { type: "asset", source: ".lazy{display:block}" };
  } else assert.fail(`Unknown unsupported bundle case: ${failure}`);
  const original = structuredClone(bundle);
  await assert.rejects(embedLicenseNotices().generateBundle.handler.call({ addWatchFile() {}, parse: parseAst }, {}, bundle), /Unsupported standalone bundle/);
  assert.deepEqual(bundle, original);
});

Then("inlined lazy modules retain their licenses without leaving executable assets", async function () {
  const bundle = {
    "index.html": { type: "asset", fileName: "index.html", source: "<body><script>startApplication();</script></body>" },
    "index.js": { type: "chunk", fileName: "index.js", isEntry: true, imports: [], dynamicImports: ["index.js"],
      code: 'const grammar = "import(anything)"; Promise.resolve().then(() => ({ grammar }));' },
    [licenseInventoryFile]: { type: "asset", source: JSON.stringify([{ name: "fixture", version: "1.0.0", text: "MIT notice" }]) },
  };
  await embedLicenseNotices().generateBundle.handler.call({ addWatchFile() {}, parse: parseAst }, {}, bundle);
  assert.deepEqual(Object.keys(bundle), ["index.html"]);
  assert.match(bundle["index.html"].source, /data-license-source="npm:fixture@1\.0\.0">MIT notice/);
});
Then("language engine packages match their trusted catalog without external imports", {timeout:30_000}, async function(){
  const {createHash}=await import('node:crypto');
  const {catalog}=await(await import('../build/language-packages.mjs')).createLanguagePackages();
  assert.deepEqual(catalog.map(item=>item.id).sort(),['typescript','html','css','json','yaml','markdown','graphql','dockerfile','postgres','toml','wgsl','liquid'].sort());
  for(const item of catalog){
    const bytes=await publishedPackageBytes(item),envelope=JSON.parse(bytes);
    assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
    assert.equal(envelope.version,item.version);
    for(const resource of Object.values(envelope.resources??{}))assert.ok(WebAssembly.validate(Buffer.from(resource,'base64')));assert.equal(envelope.id,item.id);
    assert.ok(envelope.notices.some(notice=>notice.name==='LICENSE'));
    assert.ok(envelope.notices.every(notice=>notice.text.trim().length>100));
    const payload=Buffer.from(envelope.payload,'base64');assert.equal(payload.length,item.payloadBytes);
    if(item.id==='dockerfile') assert.doesNotMatch(payload.toString(),/auth\.docker\.io|registry-1\.docker\.io|node:https/);
    const ast=parseAst(payload.toString());assert.ok(!ast.body.some(node=>node.type==='ImportDeclaration'||node.source));
    assert.ok(!this.html.includes(envelope.payload));
  }
});

Then('type library packages contain declarations and notices outside the engine and core HTML',async function(){
  const {catalog}=await(await import('../build/type-packages.mjs')).createTypePackages();
  assert.deepEqual(catalog.map(item=>item.id).sort(),['browser','node','scripthost','webworker']);
  const engineFile=(await readdir('dist/languages')).find(name=>name.startsWith('typescript-'));
  const engine=JSON.parse(await readFile(`dist/languages/${engineFile}`,'utf8')),engineText=Buffer.from(engine.payload,'base64').toString();
  assert.ok(!engine.notices.some(notice=>['@types/node','undici-types'].includes(notice.name)));
  for(const item of catalog){
    const bytes=await publishedPackageBytes(item),envelope=JSON.parse(bytes);
    assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
    assert.equal(envelope.id,item.id);assert.equal(envelope.version,item.version);assert.equal(envelope.kind,'data');
    const payload=Buffer.from(envelope.payload,'base64');assert.equal(payload.length,item.payloadBytes);
    assert.ok(!this.html.includes(envelope.payload));
    assert.ok(envelope.notices.some(notice=>notice.name==='LICENSE'));
    assert.ok(envelope.notices.every(notice=>notice.text.trim().length>100));
    const files=JSON.parse(payload);
    assert.ok(Object.keys(files).length>0);
    for(const [path,source]of Object.entries(files)){
      assert.match(path,/^\/(?:lib\/lib\.[\w.]+\.d\.ts|repository\/node_modules\/(?:@types\/node|undici-types)\/(?:[\w.-]+\/)*(?:[\w.-]+\.d\.ts|package\.json))$/);
      assert.equal(typeof source,'string');
      assert.ok(!engineText.includes(JSON.stringify(source).slice(1,-1)),'Optional declarations stay outside the engine');
    }
    if(item.id==='node'){
      assert.ok(files['/repository/node_modules/@types/node/index.d.ts']);assert.ok(files['/repository/node_modules/undici-types/index.d.ts']);
      for(const npm of ['@types/node','undici-types'])assert.equal(envelope.notices.find(notice=>notice.name===npm).text,await readFile(`node_modules/${npm}/LICENSE`,'utf8'));
    }else assert.equal(envelope.notices.find(notice=>notice.name==='typescript').text,await readFile('node_modules/typescript/LICENSE.txt','utf8'));
  }
});

Then("optional HCL syntax stays separate with verified metadata and complete notices", async function () {
  const {catalog}=await(await import('../build/syntax-packages.mjs')).createSyntaxPackages();
  assert.deepEqual(catalog.map(item=>item.id),["hcl","handlebars-beta"]);
  const item=catalog[0],bytes=await publishedPackageBytes(item),envelope=JSON.parse(bytes);
  assert.equal(bytes.length,item.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  const code=Buffer.from(envelope.payload,'base64').toString();
  assert.ok(!/\bimport\s*(?:\(|["'{*])/.test(code),'No runtime imports in optional parser');
  assert.ok(!this.html.includes(code),'HCL implementation stays out of core HTML');
  const upstream=await readFile('node_modules/codemirror-lang-hcl/LICENSE','utf8');
  assert.ok(envelope.notices.some(notice=>notice.name==='codemirror-lang-hcl' && notice.text===upstream));
});

Then("the Handlebars beta is a verified separate package with its complete upstream notice", async function () {
  const {catalog}=await(await import('../build/syntax-packages.mjs')).createSyntaxPackages();
  const item=catalog.find(item=>item.id==='handlebars-beta');assert.ok(item);
  assert.equal(item.version,'0.1.0-beta.4');
  const bytes=await publishedPackageBytes(item),envelope=JSON.parse(bytes);
  assert.equal(bytes.length,item.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256);
  const code=Buffer.from(envelope.payload,'base64').toString();
  assert.ok(!/\bimport\s*(?:\(|["'{*])/.test(code));assert.ok(!this.html.includes(code));
  const upstream=await readFile('node_modules/@gentrace/codemirror-lang-handlebars/LICENSE','utf8');
  assert.ok(envelope.notices.some(notice=>notice.name==='@gentrace/codemirror-lang-handlebars'&&notice.text===upstream));
});
