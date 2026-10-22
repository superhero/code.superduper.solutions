// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { githubRepository } from './github-repository.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';
import { collectInlineWorkerLicenses } from './license-notices.mjs';
const shared = {
  '@codemirror/lang-html': '__syntaxHost.html',
  '@codemirror/language': '__syntaxHost.language',
  '@lezer/highlight': '__syntaxHost.highlight',
  '@lezer/lr': '__syntaxHost.lr',
  '@lezer/common': '__syntaxHost.common',
};
let generated;
export function createSyntaxPackages() { return generated ??= generate().catch(error=>{generated=undefined;throw error;}); }
async function generate() {
  const assets=new Map(),catalog=[];
  for(const [id,name,languages,npm,entry,factory] of [
    ['hcl','HCL / Terraform','HCL, Terraform, Terraform variables','codemirror-lang-hcl','node_modules/codemirror-lang-hcl/dist/index.js','hcl'],
    ['handlebars-beta','Handlebars (Gentrace beta)','Handlebars, HTML','@gentrace/codemirror-lang-handlebars','src/lib/syntax/handlebars-beta.ts','create'],
  ]) {
  const metadata=JSON.parse(await readFile(`node_modules/${npm}/package.json`,'utf8'));
  const notices=await Promise.all(['LICENSE','LICENSE-ADDITIONAL-TERMS'].map(async name=>({name,version:'application',text:await readFile(name,'utf8')})));
  const bundle=await rolldown({input:entry,platform:'browser',external:Object.keys(shared),plugins:[collectInlineWorkerLicenses(notices)]});
  try {
    const output=await bundle.generate({format:'iife',name:'SyntaxPackage',globals:shared,minify:true,codeSplitting:false});
    const chunks=output.output.filter(item=>item.type==='chunk');
    if(chunks.length!==1||chunks[0].dynamicImports.length||chunks[0].imports.some(id=>!Object.hasOwn(shared,id)))throw new Error('Syntax package has unreviewed runtime imports.');
    // Pass the host modules explicitly: duplicate CodeMirror facets and Lezer tags
    // would produce invalid extensions or lose highlighting. Never use globals.
    const payload=Buffer.from(`export function create(__syntaxHost){${chunks[0].code};return SyntaxPackage.${factory}();}`);
    const envelope=Buffer.from(JSON.stringify({schema:1,id,version:metadata.version,kind:'module',payload:payload.toString('base64'),notices}));
    const sha256=createHash('sha256').update(envelope).digest('hex'),filename=`syntax/${id}-${metadata.version}-${sha256.slice(0,12)}.syntax.json`;
    assets.set(filename,envelope);catalog.push({id,name,languages,version:metadata.version,kind:'module',github:githubRepository(metadata.repository ?? 'https://github.com/gentrace/lang-handlebars'),bytes:envelope.length,payloadBytes:payload.length,sha256,url:`./${filename}`});
  } finally {await bundle.close();}
  }
  return {assets,catalog};
}
export function syntaxCatalog(){return {
  name:'code-syntax-catalog',enforce:'pre',
  resolveId(id){if(id==='virtual:syntax-catalog')return '\0syntax-catalog';},
  async load(id){if(id==='\0syntax-catalog')return `export default ${JSON.stringify((await createSyntaxPackages()).catalog)}`;},
};}
export function syntaxPackages(){return {
  ...syntaxCatalog(),name:'code-optional-syntax',
  async configureServer(server){
    const watched=new Set(['src/lib/editor/handlebars.ts','src/lib/syntax/handlebars-beta.ts'].map(file=>resolve(file)));
    server.watcher.add([...watched]);
    const regenerate=file=>{if(!watched.has(resolve(file)))return;generated=undefined;void server.restart();};
    server.watcher.on('change',regenerate);server.httpServer?.once('close',()=>server.watcher.off('change',regenerate));
    const {assets}=await createSyntaxPackages();server.middlewares.use((request,response,next)=>{
    const bytes=assets.get((request.url??'').split('?')[0].replace(/^\//,''));if(!bytes)return next();response.setHeader('Content-Type','application/json');response.end(bytes);
  });},
  generateBundle:{order:'post',async handler(){for(const [fileName,source]of(await createSyntaxPackages()).assets)this.emitFile({type:'asset',fileName,source});}}
};}
