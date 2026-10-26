// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {fontStylesheet, googleFont, isBundledEditorFont} from './fonts';
type StoredFace = {bytes: ArrayBuffer; style: string; weight: string; unicodeRange: string};
type StoredFont = {key: string; family: string; faces: StoredFace[]; license: string; licenseUrl: string};
const database = () => new Promise<IDBDatabase>((resolve,reject) => {
  const request=indexedDB.open('code.editor-fonts.v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('fonts',{keyPath:'key'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function read(key:string):Promise<StoredFont|undefined>{
  const db=await database();
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('fonts'),request=tx.objectStore('fonts').get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{db.close();}
}
export async function isFontInstalled(key:string):Promise<boolean>{return isBundledEditorFont(key) || Boolean(await read(key));}
const maximumBytes=32*1024*1024;
async function download(url:string):Promise<ArrayBuffer>{
  const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(30_000)});
  if(!response.ok)throw new Error('The font could not be downloaded.');
  const reader=response.body?.getReader();if(!reader)throw new Error('The font download was empty.');
  const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximumBytes)throw new Error('The font download is too large.');chunks.push(value);}}catch(error){await reader.cancel();throw error;}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes.buffer;
}
export async function installFont(key:string):Promise<void>{
  if(isBundledEditorFont(key))return;
  const font=googleFont(key);if(!font)throw new Error('Unknown editor font.');
  const css=new TextDecoder().decode(await download(fontStylesheet(key)));
  const faces:StoredFace[]=[];let total=0;
  for(const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)){
    const block=match[1]!;
    const address=/src:\s*url\(([^)]+)\)/.exec(block)?.[1]?.replace(/^['"]|['"]$/g,'');
    if(!address)continue;
    const url=new URL(address);if(url.origin!=='https://fonts.gstatic.com')throw new Error('Unexpected font download source.');
    const bytes=await download(url.href);total+=bytes.byteLength;if(total>maximumBytes)throw new Error('The font installation is too large.');
    const descriptor=(name:string,fallback:string)=>new RegExp(`${name}:\\s*([^;]+)`).exec(block)?.[1]?.trim()??fallback;
    const face={bytes,style:descriptor('font-style','normal'),weight:descriptor('font-weight','400'),unicodeRange:descriptor('unicode-range','U+0-10FFFF')};
    await new FontFace(font.family,bytes,face).load();faces.push(face);
  }
  if(!faces.length)throw new Error('No font files were available.');
  const license=new TextDecoder().decode(await download(font.licenseUrl));
  if(!license.trim())throw new Error('The font license was unavailable.');
  const record:StoredFont={key,family:font.family,faces,license,licenseUrl:font.licenseUrl};
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('fonts','readwrite');tx.objectStore('fonts').put(record);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  window.dispatchEvent(new Event('code-editor-font-installed'));
}
/** Delete the offline copy without changing repository font preferences. */
export async function removeFont(key:string):Promise<void>{
  if(isBundledEditorFont(key))throw new Error('This font is built into the app.');
  if(!googleFont(key))throw new Error('Unknown editor font.');
  const db=await database();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('fonts','readwrite');tx.objectStore('fonts').delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  for(const state of activations.values())if(state.key===key){state.generation++;state.link?.remove();delete state.link;}
  for(const face of loaded.get(key)??[])document.fonts.delete(face);
  loaded.delete(key);
  window.dispatchEvent(new Event('code-editor-font-removed'));
}
const activations = new Map<string,{generation:number;key?:string;link?:HTMLLinkElement}>();
const loaded=new Map<string,FontFace[]>();
export async function activateEditorFont(key:string,slot='editor'):Promise<void>{
  let state=activations.get(slot);if(!state){state={generation:0};activations.set(slot,state);}
  const epoch=++state.generation;
  state.key=key;
  state.link?.remove();delete state.link;
  const font=googleFont(key);if(!font || isBundledEditorFont(key))return;
  const stored=await read(key).catch(()=>undefined);if(epoch!==state.generation)return;
  if(stored){
    if(!loaded.has(key)){
      const faces=stored.faces.map(face=>new FontFace(font.family,face.bytes,face));
      for(const face of faces)document.fonts.add(face);loaded.set(key,faces);
    }
    return;
  }
  if(!navigator.onLine)return;
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href=fontStylesheet(key);stylesheet.dataset.editorFont=key;state.link=stylesheet;
  await new Promise<void>(resolve=>{stylesheet.onload=()=>resolve();stylesheet.onerror=()=>resolve();document.head.append(stylesheet);});
  if(epoch===state.generation)await document.fonts.load(`14px ${JSON.stringify(font.family)}`);
}
/** Menu previews use separate family names so they cannot replace editor glyphs. */
export async function previewEditorFont(key:string):Promise<()=>void>{
  const font=googleFont(key);if(!font || isBundledEditorFont(key))return()=>{};
  const family=`Code preview ${font.family}`;
  const stored=await read(key).catch(()=>undefined);
  if(stored){
    const faces=stored.faces.map(face=>new FontFace(family,face.bytes,face));
    for(const face of faces)document.fonts.add(face);
    return()=>{for(const face of faces)document.fonts.delete(face);};
  }
  try{
    const css=new TextDecoder().decode(await download(`${fontStylesheet(key)}&text=${encodeURIComponent(font.family)}`));
    const stylesheet=document.createElement('style');stylesheet.dataset.fontPreview=key;
    stylesheet.textContent=css.replace(/font-family:\s*[^;]+;/g,`font-family: ${JSON.stringify(family)};`);
    document.head.append(stylesheet);
    return()=>stylesheet.remove();
  }catch{return()=>{};}
}
