// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const adaptedSources={"@postgres-language-server/wasm/wasm/pgls.js": "3f7e097f9506c8218a740b115f955a276047ba171dd542f468f6f50fa93877a0", "@postgres-language-server/wasm/dist/common.js": "cb1a4d3c0db772769be4211493fa3587d9518f87bbf71b81e1a197f1c50b3d67"};
export const languageResources={
 postgres:{postgres:'@postgres-language-server/wasm/wasm/pgls.wasm'},
 wgsl:{wgsl:'wgslender-lsp/wgslender-lsp.wasm'},
};
export async function resourcesFor(id){return Object.fromEntries(await Promise.all(Object.entries(languageResources[id]??{}).map(async([name,path])=>[name,(await readFile(resolve('node_modules',path))).toString('base64')])));}
export function browserLanguageResources(){return{
 name:'code-language-resources',
 resolveId(id){if(id==='virtual:pgls-module')return resolve('node_modules/@postgres-language-server/wasm/wasm/pgls.js');if(id==='virtual:engine-resources')return '\0engine-resources';},
 transform(code,id){
  const path=id.replaceAll('\\','/'),source=Object.keys(adaptedSources).find(file=>path.endsWith('/node_modules/'+file));
  if(source&&createHash('sha256').update(code).digest('hex')!==adaptedSources[source])throw new Error('Browser engine source changed; review adaptation: '+source);
  if(id.replaceAll('\\','/').endsWith('/@postgres-language-server/wasm/dist/common.js'))return code.replace('if (isNode()) {','if (false) {');
  if(id.replaceAll('\\','/').endsWith('/@postgres-language-server/wasm/wasm/pgls.js'))return code.replace(/var ENVIRONMENT_IS_NODE=[^;]+;/,'var ENVIRONMENT_IS_NODE=false;').replaceAll('if(ENVIRONMENT_IS_NODE)','if(false)');
 },
 load(id){if(id==='\0engine-resources')return `let resources={};export function setResources(value){resources=value}export function bytes(name){if(!resources[name])throw new Error('Missing installed engine resource: '+name);return Uint8Array.from(atob(resources[name]),c=>c.charCodeAt(0))}`;},
};}
