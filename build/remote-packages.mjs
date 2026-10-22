// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';
import { collectInlineWorkerLicenses } from './license-notices.mjs';
import { githubRepository } from './github-repository.mjs';
let generated;
export function createRemotePackages() { return generated ??= generate().catch(error => { generated = undefined; throw error; }); }
async function generate() {
  const assets = new Map(), catalog = [];
  for (const [id, name, npm] of [['github','GitHub · Octokit','@octokit/rest'],['gitlab','GitLab · GitBeaker','@gitbeaker/rest'],['bitbucket','Bitbucket · Bitbucket.js','bitbucket']]) {
    const metadata = JSON.parse(await readFile(`node_modules/${npm}/package.json`, 'utf8'));
    const notices = await Promise.all(['LICENSE','LICENSE-ADDITIONAL-TERMS'].map(async name => ({ name, version:'application', text:await readFile(name,'utf8') })));
    const bundle = await rolldown({ input:`src/lib/remotes/adapters/${id}.ts`, platform:'browser', plugins:[collectInlineWorkerLicenses(notices)] });
    try {
      const output = await bundle.generate({format:'es',minify:true,codeSplitting:false});
      const chunks = output.output.filter(item => item.type === 'chunk');
      if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) throw new Error('An upstream integration has unreviewed runtime imports.');
      const payload = Buffer.from(chunks[0].code);
      const envelope = Buffer.from(JSON.stringify({schema:1,id,version:metadata.version,kind:'module',payload:payload.toString('base64'),notices}));
      const sha256 = createHash('sha256').update(envelope).digest('hex'), filename = `remotes/${id}-${metadata.version}-${sha256.slice(0,12)}.remote.json`;
      assets.set(filename,envelope);
      const source = typeof metadata.repository === 'string' && metadata.repository.startsWith('github:') ? metadata.repository.replace(/^github:/,'https://github.com/') : metadata.repository;
      catalog.push({id,name,languages:'Repository hosting, pull requests and issues',version:metadata.version,kind:'module',github:githubRepository(source),bytes:envelope.length,payloadBytes:payload.length,sha256,url:`./${filename}`});
    } finally { await bundle.close(); }
  }
  return {assets,catalog};
}
export function remotePackages() { return {
  name:'code-optional-remotes',enforce:'pre',
  resolveId(id) { if (id === 'virtual:remote-catalog') return '\0remote-catalog'; },
  async load(id) { if (id === '\0remote-catalog') return `export default ${JSON.stringify((await createRemotePackages()).catalog)}`; },
  async configureServer(server) {
    const files = new Set(['github','gitlab','bitbucket'].map(id => resolve(`src/lib/remotes/adapters/${id}.ts`)));
    server.watcher.add([...files]);
    const regenerate = file => { if (files.has(resolve(file))) { generated = undefined; void server.restart(); } };
    server.watcher.on('change',regenerate); server.httpServer?.once('close',()=>server.watcher.off('change',regenerate));
    const {assets} = await createRemotePackages();
    server.middlewares.use((request,response,next)=>{
      const bytes=assets.get((request.url??'').split('?')[0].replace(/^\//,'')); if(!bytes)return next();
      response.setHeader('Content-Type','application/json'); response.end(bytes);
    });
  },
  generateBundle:{order:'post',async handler(){for(const [fileName,source]of(await createRemotePackages()).assets)this.emitFile({type:'asset',fileName,source});}}
}; }
