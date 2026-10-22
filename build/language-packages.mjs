// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { githubRepository } from './github-repository.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { rolldown } from 'rolldown';
import {bundledLiquidDocs,liquidDocs} from './liquid-docs.mjs';
import {browserLanguageResources,resourcesFor} from './language-resources.mjs';
import { offlineDockerRegistry } from './offline-docker-registry.mjs';
import { collectInlineWorkerLicenses } from './license-notices.mjs';
const definitions = [
  ['liquid','Shopify Liquid','Shopify Liquid','@shopify/theme-language-server-browser'],
  ['postgres','PostgreSQL','PostgreSQL SQL','@postgres-language-server/wasm'],
  ['toml','Taplo','TOML','@taplo/lsp'],
  ['wgsl','WGSL','WGSL','wgslender-lsp'],
  ['dockerfile','Dockerfile','Dockerfile, Containerfile','dockerfile-language-service'],
  ['typescript','TypeScript','JavaScript, TypeScript, JSX, TSX','typescript'],
  ['html','HTML','HTML','vscode-html-languageservice'],
  ['css','CSS / SCSS / Less','CSS, SCSS, Less','vscode-css-languageservice'],
  ['json','JSON / JSONC','JSON, JSONC','vscode-json-languageservice'],
  ['yaml','YAML','YAML','yaml-language-server'],
  ['markdown','Markdown','Markdown','vscode-markdown-languageservice'],
  ['graphql','GraphQL','GraphQL','graphql-language-service'],
];
let generated;
export function createLanguagePackages() { return generated ??= generate().catch(error=>{generated=undefined;throw error;}); }
async function generate() {
  const assets=new Map(),catalog=[];
  const projectNotices=await Promise.all(['LICENSE','LICENSE-ADDITIONAL-TERMS'].map(async name=>({name,version:'application',text:await readFile(name,'utf8')})));
  for(const [id,name,languages,npm] of definitions){
    const metadata=JSON.parse(await readFile(`node_modules/${npm}/package.json`,'utf8')),notices=[];
    const entry='\0language-engine-entry';
    const bundle=await rolldown({input:entry,platform:'browser',logLevel:'warn',transform:{define:{'process.platform':JSON.stringify('browser'),'process.version':JSON.stringify(''),'process.cwd':'(()=>"/repository")'}},plugins:[bundledLiquidDocs(),browserLanguageResources(),offlineDockerRegistry(),{
      name:'browser-language-engine',
      resolveId(source){
        if(id==='liquid'){
          if(source==='cross-fetch')return resolve('src/lib/intelligence/engines/liquid-offline-fetch.ts');
          if(['vscode-languageserver','vscode-languageserver/browser'].includes(source))return resolve('node_modules/vscode-languageserver/lib/browser/main.js');
          if(['vscode-languageserver-protocol','vscode-languageserver-protocol/browser'].includes(source))return resolve('node_modules/vscode-languageserver/node_modules/vscode-languageserver-protocol/lib/browser/main.js');
          if(['vscode-jsonrpc','vscode-jsonrpc/browser'].includes(source))return resolve('node_modules/vscode-languageserver/node_modules/vscode-jsonrpc/lib/browser/main.js');
        }
        if(source===entry||source==='virtual:typescript-libraries') return source;
        if(source==='path'||source==='node:path')return resolve('node_modules/path-browserify/index.js');
        if(source==='vscode-languageserver')return resolve('node_modules/yaml-language-server/node_modules/vscode-languageserver/lib/browser/main.js');
        if(source==='vscode-uri')return resolve('node_modules/vscode-uri/lib/umd/index.js');
        if(source==='vscode-languageserver-protocol')return resolve('node_modules/vscode-languageserver-protocol/lib/browser/main.js');
      },
      async load(source){
        if(source==='virtual:typescript-libraries'){
          const files=(await readdir('node_modules/typescript/lib')).filter(file=>/^lib.*\.d\.ts$/.test(file)&&!/^lib\.(?:dom|webworker|scripthost)(?:\.|$)/.test(file));
          const libraries=Object.fromEntries(await Promise.all(files.map(async file=>['/lib/'+file,await readFile('node_modules/typescript/lib/'+file,'utf8')])));
          return {code:`export default ${JSON.stringify(libraries)}`,moduleType:'js'};
        }
        if(source===entry)return {code:`import {run${id==='typescript'?',setTypeLibraries':''}} from './src/lib/intelligence/engines/${id}.ts';import {setResources} from 'virtual:engine-resources';
          ${['postgres','wgsl','liquid'].includes(id)?`globalThis.fetch=()=>Promise.reject(new Error('This engine uses installed local resources only.'));`:''}
          let queue=Promise.resolve();
          self.onmessage=event=>{${id==='typescript'?'if(event.data.typeLibraries)setTypeLibraries(event.data.typeLibraries,event.data.typeLibraryPayloads??[]);':''}if(event.data.resources){setResources(event.data.resources);return;}const {id,request}=event.data;queue=queue.then(async()=>{try{self.postMessage({id,result:await run(request)})}catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)})}})};`,moduleType:'js',resolveDir:resolve('.')};
      }
    },collectInlineWorkerLicenses(notices)]});
    try{
      const output=await bundle.generate({format:'es',minify:true,codeSplitting:false});
      const chunks=output.output.filter(item=>item.type==='chunk');
      if(chunks.length!==1||chunks[0].imports.length||chunks[0].dynamicImports.length)throw new Error(`${name} has external runtime imports.`);
      const payload=Buffer.from(chunks[0].code),unique=new Map(notices.map(notice=>[`${notice.name}@${notice.version}`,notice]));
      if(id==='liquid')unique.set('Shopify/theme-liquid-docs',(await liquidDocs()).notice);
      if(id==='typescript'){
        unique.set('typescript/ThirdPartyNoticeText',{name:'TypeScript third-party notices',version:metadata.version,text:await readFile('node_modules/typescript/ThirdPartyNoticeText.txt','utf8')});
      }
      const envelope=Buffer.from(JSON.stringify({schema:1,id,version:metadata.version,kind:'module',payload:payload.toString('base64'),resources:await resourcesFor(id),notices:[...projectNotices,...unique.values()]}));
      const sha256=createHash('sha256').update(envelope).digest('hex'),filename=`languages/${id}-${metadata.version}-${sha256.slice(0,12)}.language.json`;
      assets.set(filename,envelope);catalog.push({id,name,languages,version:metadata.version,kind:'module',github:githubRepository(metadata.repository),bytes:envelope.length,payloadBytes:payload.length,sha256,url:`./${filename}`});
    }finally{await bundle.close();}
  }
  return{assets,catalog};
}
export function languagePackages(){return{
  name:'code-optional-language-engines',enforce:'pre',
  resolveId(id){if(id==='virtual:language-engine-catalog')return '\0language-engine-catalog';},
  async load(id){if(id==='\0language-engine-catalog')return `export default ${JSON.stringify((await createLanguagePackages()).catalog)}`;},
  async configureServer(server){
    const directory=resolve('src/lib/intelligence/engines');server.watcher.add(directory);
    const regenerate=filename=>{if(!resolve(filename).startsWith(directory+'/'))return;generated=undefined;void server.restart();};
    server.watcher.on('change',regenerate);server.httpServer?.once('close',()=>server.watcher.off('change',regenerate));
    const {assets}=await createLanguagePackages();server.middlewares.use((request,response,next)=>{
    const bytes=assets.get((request.url??'').split('?')[0].replace(/^\//,''));if(!bytes)return next();response.setHeader('Content-Type','application/json');response.end(bytes);
  });},
  generateBundle:{order:'post',async handler(){for(const [fileName,source]of(await createLanguagePackages()).assets)this.emitFile({type:'asset',fileName,source});}}
};}
