// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { createFromBuffer } from "@dprint/formatter";

export const licenseInventoryFile = ".vite/license.json";

const projectRoot = new URL("../", import.meta.url);
const sourceNotices = [
  ["LICENSE", "Application license"],
  ["LICENSE-ADDITIONAL-TERMS", "Application additional terms and attribution"],
  ["src/assets/fonts/Geomini-OFL.txt", "Geomini interface font"],
  ["src/assets/fonts/JetBrainsMono-OFL.txt", "JetBrains Mono editor fonts"],
  ["src/assets/fonts/Montserrat-OFL.txt", "Montserrat fonts"],
  ["src/assets/fonts/Rationale-OFL.txt", "Rationale font"],
  ["src/assets/fonts/Material-Symbols-Apache-2.0.txt", "Material Symbols Rounded font"],
  ["src/assets/fonts/Devicon-MIT.txt", "Devicon font and brand notice"],
  ["src/lib/components/ui/LICENSE.shadcn-svelte", "Vendored shadcn-svelte interface source"],
  ["src/lib/secrets/NOTICES.md", "Vault Argon2 and embedded BLAKE2 notices"],
  ["src/lib/assistant/NOTICES.md", "Browser Markdown include and snippet adapters"],
];
const stylesheetPackages = ["tailwindcss", "tw-animate-css"];
// These packages carry their complete Rust/plugin notices inside the Wasm binary.
const wasmNoticePackages = new Set(["@dprint/typescript", "@dprint/json", "@dprint/markdown",
  "@dprint/toml", "@dprint/dockerfile", "@dprint/ruff", "@dprint/mago", "@dprint/roslyn", "@dprint/jupyter"]);
const wasmNotices = new Map();
const packageLicenseFallbacks = new Map([
  ["onnxruntime-common@1.31.0-dev.20260911-2a43ec07e", {identifier:"MIT",path:"build/licenses/onnxruntime-1.31.0-dev.txt",sources:[["package.json","815c646c7462cb55bc57016cd69c1d9952bb1d2464a9892a09b6ed875a70dad2"]]}],
  ["onnxruntime-web@1.31.0-dev.20260914-8d85527a0", {identifier:"MIT",path:"build/licenses/onnxruntime-1.31.0-dev.txt",sources:[["package.json","ce2ce78732a15ddcaf52fe5f26c801a05ff149abda4e875dc2837d8a99e455b2"]]}],
  ["@litert-lm/core@0.18.0", {identifier:"Apache-2.0",path:"build/licenses/litert-lm-0.18.0.txt",sources:[["package.json","13c1b8e6582e4752aff38a97828fb37c98a12b60ff23f230acc36789f74fc37a"],["dist/load.js","f5471b9c94e38fcc0a984111e0b0216e5fb38df6460e588b0d13a8d39fc56f71"]]}],
  ["@litertjs/wasm-utils@2.6.0", {identifier:"Apache-2.0",path:"build/licenses/litert-lm-0.18.0.txt",sources:[["package.json","2e36593c3081d1df3957dd09fecad5de9fd308fd5834efad291e30b382151093"]]}],
  ["onnxruntime-web@1.30.0", { identifier: "MIT", path: "build/licenses/onnxruntime-1.30.0-LICENSE.txt", sources: [["package.json", "16f69f755509990539aeb1c8445884960e91adcacab2e8dca8e44ee43601df5c"]] }],
  ["onnxruntime-common@1.30.0", { identifier: "MIT", path: "build/licenses/onnxruntime-1.30.0-LICENSE.txt", sources: [["package.json", "4266741a80346e25820ccc494fbffb95e2f652b6dfb5585025be44df3b0d6722"]] }],
  ["@earendil-works/pi-agent-core@1.3.0", { identifier: "MIT", path: "build/licenses/pi-1.3.0.txt", sources: [["package.json", "67728d06e96459b7fe96c490b563865fb78f7eafcecb708e7ae43e6dd857a324"]] }],
  ["@earendil-works/pi-ai@1.3.0", { identifier: "MIT", path: "build/licenses/pi-1.3.0.txt", sources: [["package.json", "4e9ed07b06a91d844485874c251f312b610d015a4a4fd32c78cde58a7862a3f1"]] }],
  ["@earendil-works/pi-telemetry@1.3.0", { identifier: "MIT", path: "build/licenses/pi-1.3.0.txt", sources: [["package.json", "386479e7767a2aff572fea6339558405b1b23e9e7951504731515fc71b7db6ae"]] }],
  ["@mathjax/mathjax-tex-font@4.1.3", { identifier: "Apache-2.0", path: "build/licenses/mathjax-fonts-4.1.3.txt", sources: [["package.json", "86d89ab67ecdf67f642b0fc5fc249e7fcdf26ea6531ee8fa3eaba9a0378000a3"]] }],
  ["@mathjax/mathjax-newcm-font@4.1.3", { identifier: "Apache-2.0", path: "build/licenses/mathjax-fonts-4.1.3.txt", sources: [["package.json", "b6fd3b04fb134b062950f1af6eb9f0fffc08e48c044f109f25775afa8ffc87ed"]] }],
  ["@replit/codemirror-minimap@0.5.2", {identifier:"MIT",path:"build/licenses/codemirror-minimap-0.5.2.txt",sources:[["dist/index.js","51d4b0a461d965bb912a545f9c096eb6a4207d689d4bfc279addb68024f71892"],["package.json","428b7d1c1ad1433a520b6516f2a7d0a5c2f3a8296d1d583480c72a7dc5ce7c4b"]]}],
  ["isarray@1.0.0", {identifier:"MIT",path:"build/licenses/isarray-1.0.0.txt",sources:[["index.js", "9b8c691372802da788c9c5f4e1ca2f1ed0b88ab8722176c2aea15e38ec86d249"], ["README.md", "ff138e683771b187f3629c383db72ee7d632009010a36d08e18e8d2a34222ec7"]]}],
  ["@postgres-language-server/wasm@0.28.2", {identifier:"MIT",path:"build/licenses/postgres-wasm-0.28.2.txt",sources:[["wasm/pgls.wasm","f025228dbd9533714c37a5c0561dc02f28da3608245c9526460fac6f03137a8f"]]}],
  ["@taplo/lsp@0.8.0", {identifier:"MIT",path:"build/licenses/taplo-lsp-0.8.0.txt",sources:[["dist/index.js","bf8a1a4028e6f944c91b4cfb07d09903e03324619ee3affc8b07ed3905221421"]]}],
  ["wgslender-lsp@1.5.1", {identifier:"CC0-1.0",path:"build/licenses/wgslender-lsp-1.5.1.txt",sources:[["wgslender-lsp.wasm","68c168ad0afa369cbec725ed83c09bc03c02192136dc31ddcd0db4273b0b6f43"]]}],
  ["boolbase@1.0.0", { identifier: "ISC", path: "build/licenses/boolbase-1.0.0.txt", sources: [["index.js", "c62510fca8738c7444cdf5012bdd0ce214a1b6f7eaff7facb3a919e4656d7341"]] }],
  ["@vscode/l10n@0.0.18", { identifier: "MIT", path: "build/licenses/vscode-l10n-0.0.18.txt", sources: [["dist/browser.js", "7e74b4963b59a7c5e380699233d7aa7cc94fb095706fb34e8ad88bf825cc78d5"]] }],
  ["locate-character@3.0.0", { identifier: "MIT", path: "build/licenses/locate-character-3.0.0.txt", sources: [
    ["src/index.js", "19e0ac7971b2260dc8acef5e2cdc0bf79eb65edcb1263e238389f7fd5a43d1d2"],
  ] }],
  ["clean-git-ref@2.0.1", { identifier: "Apache-2.0", path: "build/licenses/clean-git-ref-2.0.1.txt" }],
  ["diff3@0.0.3", { identifier: "MIT", path: "build/licenses/diff3-0.0.3.txt", sources: [
    ["diff3.js", "a2cf76d0acfaae0e098434307a1180d24ebf86451b70cbfc81704df55c54896f"],
    ["onp.js", "6970cf6907e5f3e62a95cf6942eb4199858ce9d42af866e064901f6183319a70"],
  ] }],
]);

async function completePackageNotice(entry, context, directory) {
  if (wasmNoticePackages.has(entry.name)) {
    const file = directory ? join(directory, "plugin.wasm")
      : fileURLToPath(new URL(`node_modules/${entry.name}/plugin.wasm`, projectRoot));
    context.addWatchFile(file);
    if (!wasmNotices.has(file)) {
      const formatter = createFromBuffer(await readFile(file));
      wasmNotices.set(file, requireText(formatter.getLicenseText(), `${entry.name} embedded Wasm notices`));
    }
    return { ...entry, text: wasmNotices.get(file) };
  }
  if (typeof entry.text === "string" && entry.text.trim()) return entry;
  const fallback = packageLicenseFallbacks.get(`${entry.name}@${entry.version}`);
  if (!fallback) { packageNotice(entry); return entry; }
  if (entry.identifier !== fallback.identifier) throw new Error(`License declaration changed for ${entry.name}@${entry.version}; review the pinned notice fallback.`);
  for (const [filename, digest] of fallback.sources ?? []) {
    const path = directory ? join(directory, filename) : fileURLToPath(new URL(`node_modules/${entry.name}/${filename}`, projectRoot));
    context.addWatchFile(path);
    if (createHash("sha256").update(await readFile(path)).digest("hex") !== digest) {
      throw new Error(`License source changed for ${entry.name}@${entry.version}/${filename}; review the pinned notice fallback.`);
    }
  }
  const path = new URL(fallback.path, projectRoot);
  context.addWatchFile(fileURLToPath(path));
  return { ...entry, text: requireText(await readFile(path, "utf8"), fallback.path) };
}

function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing license notice ${label}.`);
  return value.trim();
}

function packageNotice(entry) {
  const name = requireText(entry?.name, "package name");
  const version = requireText(entry?.version, `${name} version`);
  return { source: `npm:${name}@${version}`, title: `${name} ${version}${entry.identifier ? ` (${entry.identifier})` : ""}`,
    text: requireText(entry.text, `text for ${name}@${version}`) };
}

// Template content is inert and inspectable in page source. Escape even trusted
// upstream text: a notice containing markup must never become application code.
export function renderLicenseNotices(notices) {
  const sections = notices.map(notice => {
    const source = escapeHtml(requireText(notice.source, "source"));
    const title = escapeHtml(requireText(notice.title, `${notice.source} title`));
    const text = escapeHtml(requireText(notice.text, `${notice.source} text`));
    return `<section><h2>${title}</h2><pre data-license-source="${source}">${text}</pre></section>`;
  });
  return `<template id="license-notices">\n<h1>Licenses and notices</h1>\n${sections.join("\n\n")}\n</template>`;
}

function isOwnedBlobImport(node) {
  const source=node.source;
  const call=source?.type==='AssignmentExpression' && source.operator==='=' && source.left.type==='Identifier' ? source.right : undefined;
  return call?.type==='CallExpression' && call.callee?.type==='MemberExpression' && !call.callee.computed
    && call.callee.object?.name==='URL' && call.callee.property?.name==='createObjectURL'
    && call.arguments.length===1 && call.arguments[0]?.type==='NewExpression'
    && call.arguments[0].callee?.name==='Blob';
}
function containsModuleImport(program, allowOwnedBlob = false) {
  const pending = [program];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (node.type === "ImportExpression" && !(allowOwnedBlob && isOwnedBlobImport(node)) || node.type === "ImportDeclaration"
      || (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") && node.source) return true;
    for (const value of Object.values(node)) if (value && typeof value === "object") pending.push(value);
  }
  return false;
}

// Vite's main license inventory excludes separately bundled inline workers.
// Collect from each worker's actual module graph before its chunk is encoded.
export function collectInlineWorkerLicenses(entries) {
  return {
    name: "code-inline-worker-license-inventory",
    apply: "build",
    async generateBundle(_options, bundle) {
      const packages = new Map();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of chunk.moduleIds) {
          if (id.startsWith("\0") || !id.includes("/node_modules/")) continue;
          let directory = dirname(id.split("?")[0]);
          while (directory.includes("/node_modules/")) {
            const manifest = join(directory, "package.json");
            let metadata;
            try { metadata = JSON.parse(await readFile(manifest, "utf8")); }
            catch (error) { if (error.code !== "ENOENT") throw error; }
            if (metadata?.name && metadata?.version) {
              if (!packages.has(manifest)) {
                const names = await readdir(directory);
                const license = names.find(name => /^(licen[cs]e|copying)([._-]|$)/i.test(name));
                this.addWatchFile(manifest);
                const licensePath = license ? join(directory, license) : undefined;
                if (licensePath) this.addWatchFile(licensePath);
                const entry = await completePackageNotice({ name: metadata.name, version: metadata.version,
                  identifier: metadata.license, text: licensePath ? await readFile(licensePath, "utf8") : undefined }, this, directory);
                packageNotice(entry);
                packages.set(manifest, entry);
              }
              break;
            }
            directory = dirname(directory);
          }
        }
      }
      if (!packages.size) throw new Error("Inline worker dependency license inventory is empty.");
      entries.push(...packages.values());
    },
  };
}

export function embedLicenseNotices(workerEntries = []) {
  return {
    name: "code-embedded-license-notices",
    apply: "build",
    enforce: "post",
    generateBundle: {
      // Vite's license plugin needs the module inventory in the original chunks.
      // Run after it and singlefile, then remove their intermediate artifacts.
      order: "post",
      async handler(_options, bundle) {
        const html = bundle["index.html"];
        const inventory = bundle[licenseInventoryFile];
        if (html?.type !== "asset" || typeof html.source !== "string") throw new Error("Missing standalone index.html for license notices.");
        if (inventory?.type !== "asset") throw new Error("Missing Vite license inventory; retain chunks until notices are embedded.");
        const entries = JSON.parse(String(inventory.source));
        if (!Array.isArray(entries) || !entries.length) throw new Error("The Vite license inventory is empty.");
        const packageNotices = (await Promise.all([...entries, ...workerEntries].map(entry => completePackageNotice(entry, this)))).map(packageNotice);
        const chunks = Object.values(bundle).filter(file => file.type === "chunk");
        const styles = Object.keys(bundle).filter(name => name.endsWith(".css"));
        if (chunks.length !== 1 || !chunks[0].isEntry || !/\.[mc]?js$/.test(chunks[0].fileName)
          || !Array.isArray(chunks[0].imports) || chunks[0].imports.length
          || !Array.isArray(chunks[0].dynamicImports)
          || chunks[0].dynamicImports.some(name => name !== chunks[0].fileName)
          // Rolldown retains a self-reference for inlined dynamic modules. Accept
          // that metadata only without runtime imports, except the owned optional loaders
          // importing a freshly created local Blob after package verification.
          || chunks[0].dynamicImports.length && containsModuleImport(this.parse(chunks[0].code),
            Object.keys(chunks[0].modules ?? {}).some(id=>id.endsWith("/src/lib/syntax/loader.ts") || id.endsWith("/src/lib/remotes/loader.ts") || id.endsWith("/src/lib/assistant/browser/runtime.ts")))
          || styles.length > 1) {
          throw new Error("Unsupported standalone bundle: expected one entry JavaScript chunk without imports and at most one stylesheet.");
        }

        const read = async path => {
          const url = new URL(path, projectRoot);
          this.addWatchFile(fileURLToPath(url));
          return requireText(await readFile(url, "utf8"), path);
        };
        const notices = await Promise.all(sourceNotices.map(async ([source, title]) => ({ source, title, text: await read(source) })));
        // CSS-only imports have no JavaScript module IDs in Vite's inventory.
        for (const name of stylesheetPackages) {
          const metadata = JSON.parse(await read(`node_modules/${name}/package.json`));
          packageNotices.push(packageNotice({ ...metadata, identifier: metadata.license, text: await read(`node_modules/${name}/LICENSE`) }));
        }
        const unique = new Map();
        for (const notice of packageNotices) {
          if (unique.has(notice.source) && unique.get(notice.source).text !== notice.text) throw new Error(`Conflicting license notices for ${notice.source}.`);
          unique.set(notice.source, notice);
        }
        notices.push(...[...unique.values()].sort((left, right) => left.source.localeCompare(right.source)));

        // Bundled parsers contain example HTML in strings. Inspect real entry
        // tags without treating raw script/style text as page markup.
        const markup = html.source.replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, "$1</script>")
          .replace(/(<style\b[^>]*>)[\s\S]*?<\/style\s*>/gi, "$1</style>");
        const bodyEnd = html.source.lastIndexOf("</body>");
        if (bodyEnd < 0 || /<template\b[^>]*\bid=["']license-notices["']/.test(markup)) throw new Error("Cannot place license notices in the standalone page.");
        if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i.test(markup)) throw new Error("Entry assets must be inlined before embedding license notices.");
        html.source = html.source.slice(0, bodyEnd) + `${renderLicenseNotices(notices)}\n` + html.source.slice(bodyEnd);
        delete bundle[licenseInventoryFile];
        delete bundle[chunks[0].fileName];
        for (const name of styles) delete bundle[name];
      },
    },
  };
}
