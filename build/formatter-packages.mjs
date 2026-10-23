// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { rolldown } from 'rolldown';
import { createFromBuffer } from '@dprint/formatter';
import { dockerfileFormatterPackage,browserFormatterPackage } from './browser-formatter-package.mjs';
import { fourmoluPackage } from './fourmolu-package.mjs';
import { formatterArtifact } from './formatter-artifacts.mjs';
import { collectInlineWorkerLicenses } from './license-notices.mjs';
import { publishPackageArtifact } from './package-artifacts.mjs';

const providers = JSON.parse(await readFile(new URL('../src/lib/formatting/providers.json', import.meta.url), 'utf8'));
const definitions = providers.filter(provider => provider.engine === 'dprint').map(provider => [provider.plugin, provider.name, provider.languages]);
const prettierDefinitions = providers.filter(provider => provider.engine === 'prettier').map(provider => [provider.plugin, provider.name, provider.languages]);
let generated;
/** Build audited, dependency-free packages. No registry/CDN access at runtime. */
export function createFormatterPackages() {
  return generated ??= generate().catch(error => { generated = undefined; throw error; });
}
async function generate() {
  const assets = new Map(), catalog = [];
  const publish = (id, name, languages, version, kind, payload, notices, resources = {}) => {
    const envelope = Buffer.from(JSON.stringify({ schema: 1, id, version, kind,
      payload: payload.toString('base64'), notices, ...resources }));
    const sha256 = createHash('sha256').update(envelope).digest('hex');
    const filename = `formatters/${id}-${version}-${sha256.slice(0, 12)}.formatter.json`;
    const transport = publishPackageArtifact(assets, filename, envelope);
    catalog.push({ id, name, languages, version, kind, github: providers.find(provider => provider.id === id).github, bytes: envelope.length,
      payloadBytes: payload.length, sha256, ...transport });
  };
  for (const [plugin, name, languages] of definitions) {
    const definition = providers.find(provider => provider.id === `dprint-${plugin}`);
    const artifact = definition.npm ? undefined : await formatterArtifact(plugin);
    const root = `node_modules/${definition.npm}`;
    const metadata = artifact?.metadata ?? JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
    const payload = artifact?.bytes ?? await readFile(`${root}/plugin.wasm`);
    const license = createFromBuffer(payload).getLicenseText().trim();
    if (!license) throw new Error(`Missing full Wasm notices: ${plugin}`);
    const notices = [{ name: metadata.name, version: metadata.version, identifier: metadata.license, text: license }];
    if (plugin === 'roslyn') {
      // The Wasm export contains only the wrapper license, not Microsoft's dependencies.
      const supplemental = JSON.parse(await readFile('build/licenses/roslyn-0.23.2.json', 'utf8'));
      if (metadata.version !== supplemental.packageVersion
        || createHash('sha256').update(payload).digest('hex') !== supplemental.wasmSha256) {
        throw new Error('Roslyn changed; review the pinned compiler/runtime dependency notices.');
      }
      if (!supplemental.notices.length || supplemental.notices.some(notice => !notice.text?.trim())) throw new Error('Missing Roslyn dependency notices.');
      notices.push(...supplemental.notices);
    }
    if (plugin === 'clang-format') {
      const supplemental = JSON.parse(await readFile('build/licenses/clang-format-0.1.0.json', 'utf8'));
      if (metadata.version !== supplemental.version || createHash('sha256').update(payload).digest('hex') !== supplemental.wasmSha256) throw new Error('clang-format changed; review LLVM notices.');
      notices.push(...supplemental.notices);
    }
    publish(`dprint-${plugin}`, name, languages, metadata.version, 'wasm', payload, notices);
  }
  const projectNotices = await Promise.all(['LICENSE', 'LICENSE-ADDITIONAL-TERMS'].map(async file => ({
    name: file, version: 'application', text: await readFile(file, 'utf8'),
  })));
  for(const [id,npm,name,languages]of [['postgres','@postgres-language-server/wasm','PostgreSQL language tools','PostgreSQL SQL'],['wgsl','wgslender-lsp','WGSL (wgslender)','WGSL']]){
    const item=await browserFormatterPackage(id,npm);
    publish(id+'-service',name,languages,item.version,'module',item.payload,[...projectNotices,...item.notices],{resources:item.resources});
  }
  const dockerfile = await dockerfileFormatterPackage();
  publish('dockerfile-service','Dockerfile language service','Dockerfile, Containerfile',dockerfile.version,'module',dockerfile.payload,[...projectNotices,...dockerfile.notices]);
  const fourmolu = await fourmoluPackage();
  publish('fourmolu','Fourmolu','Haskell, Backpack signatures',fourmolu.version,'module',fourmolu.payload,
    [...projectNotices,...fourmolu.notices],{wasm:fourmolu.wasm});
  for (const [plugin, name, languages] of prettierDefinitions) {
    const entry = plugin === 'xml' ? '@prettier/plugin-xml'
      : plugin === 'svelte' ? 'prettier-plugin-svelte/browser' : `prettier/plugins/${plugin}`;
    const metadata = JSON.parse(await readFile(`node_modules/${plugin === 'xml' ? '@prettier/plugin-xml' : plugin === 'svelte' ? 'prettier-plugin-svelte' : 'prettier'}/package.json`, 'utf8'));
    const sources = [entry];
    if (['html', 'svelte'].includes(plugin)) {
      sources.push(...['babel', 'typescript', 'estree', 'postcss', 'html', 'graphql', 'angular'].map(name => `prettier/plugins/${name}`));
    }
    const imports = [...new Set(sources)].map((source, index) => `import * as p${index} from ${JSON.stringify(source)};`);
    const virtual = '\0formatter-package';
    const code = `import {format} from 'prettier/standalone';\n${imports.join('\n')}\nexport {format};\nexport const plugins = [${[...new Set(sources)].map((_, index) => sources[index] === 'prettier-plugin-svelte/browser' ? `p${index}` : `p${index}.default`).join(',')}];`;
    const notices = [];
    const bundle = await rolldown({ input: virtual, platform: 'browser', logLevel: 'warn', plugins: [{
      name: 'formatter-entry', resolveId: id => id === virtual ? virtual : undefined,
      load: id => id === virtual ? { code, moduleType: 'js', resolveDir: resolve('.') } : undefined,
    }, collectInlineWorkerLicenses(notices)] });
    try {
      const result = await bundle.generate({ format: 'es', minify: true, codeSplitting: false });
      const chunks = result.output.filter(file => file.type === 'chunk');
      if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) throw new Error(`Formatter ${plugin} is not self-contained.`);
      const unique = new Map(notices.map(notice => [`${notice.name}@${notice.version}`, notice]));
      publish(`prettier-${plugin}`, name, languages, metadata.version, 'module', Buffer.from(chunks[0].code),
        [...projectNotices, ...[...unique.values()].sort((a, b) => a.name.localeCompare(b.name))]);
    } finally { await bundle.close(); }
  }
  return { assets, catalog };
}

export function formatterCatalog() {
  return {
    name: 'code-optional-formatters', enforce: 'pre',
    resolveId(id) { if (id === 'virtual:formatter-catalog') return '\0formatter-catalog'; },
    async load(id) {
      if (id === '\0formatter-catalog') return `export default ${JSON.stringify((await createFormatterPackages()).catalog)};`;
    },
  };
}
export function formatterPackages() {
  return {
    ...formatterCatalog(),
    async configureServer(server) {
      // This adapter is bundled outside Vite's application graph. Regenerate the
      // trusted catalog as well as its package when editing it during development.
      const adapterSources = ['fourmolu.ts','dockerfile-service.ts','postgres.ts','wgsl.ts'].map(file => resolve('src/lib/formatting',file));
      server.watcher.add(adapterSources);
      const regenerate = filename => {
        if (!adapterSources.includes(resolve(filename))) return;
        generated = undefined;
        void server.restart();
      };
      server.watcher.on('change', regenerate);
      server.httpServer?.once('close', () => server.watcher.off('change', regenerate));
      const { assets } = await createFormatterPackages();
      server.middlewares.use((request, response, next) => {
        const filename = (request.url ?? '').split('?')[0].replace(/^\//, '');
        const bytes = assets.get(filename);
        if (!bytes) return next();
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Content-Length', bytes.length);
        response.end(bytes);
      });
    },
    // Emit after singlefile has processed the application's actual entry assets.
    generateBundle: { order: 'post', async handler() {
      const { assets } = await createFormatterPackages();
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source });
    } },
  };
}
