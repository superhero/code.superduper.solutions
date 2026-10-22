// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const pin=JSON.parse(await readFile(new URL('./liquid-docs.json',import.meta.url),'utf8'));
let pending;
export function liquidDocs(){return pending??=load().catch(error=>{pending=undefined;throw error;});}
async function load(){
 const documents={};
 for(const item of pin.files){
  const path=new URL(`../tmp/liquid-docs/${item.sha256}`,import.meta.url);let bytes,downloaded=false;
  try{bytes=await readFile(path);}catch(error){
   if(error.code!=='ENOENT')throw error;downloaded=true;
   const response=await fetch(`https://raw.githubusercontent.com/${pin.repository}/${pin.revision}/${item.path}`,{signal:AbortSignal.timeout(30_000)});
   if(!response.ok||!response.body)throw new Error(`Cannot load pinned Liquid data: ${item.path}`);
   const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>item.bytes)throw new Error('Liquid data exceeded pinned size.');chunks.push(chunk);}bytes=Buffer.concat(chunks);
  }
  if(bytes.length!==item.bytes||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error(`Liquid data checksum mismatch: ${item.path}`);
  if(downloaded){await mkdir(new URL('../tmp/liquid-docs/',import.meta.url),{recursive:true});const temporary=new URL(`../tmp/liquid-docs/${randomUUID()}.tmp`,import.meta.url);await writeFile(temporary,bytes);await rename(temporary,path);}
  documents[item.path]=bytes.toString('utf8');
 }
 if(documents['LICENSE.md']!==await readFile(new URL('./licenses/shopify-liquid-docs.txt',import.meta.url),'utf8'))throw new Error('Shopify Liquid data notice differs from its pinned upstream license.');
 return {documents,notice:{name:pin.repository,version:pin.revision,text:documents['LICENSE.md']}};
}
export function bundledLiquidDocs(){return{
 name:'code-bundled-liquid-docs',
 resolveId(id){if(id==='virtual:liquid-docs')return '\0liquid-docs';},
 async load(id){if(id==='\0liquid-docs')return `export default ${JSON.stringify((await liquidDocs()).documents)}`;}
};}
