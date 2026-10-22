// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import maxSatisfying from 'semver/ranges/max-satisfying.js';
import satisfies from 'semver/functions/satisfies.js';
import {isNpmPackageName,npmTypeId} from './type-libraries.ts';
import {referencedTypePackages} from './npm-type-dependencies.ts';
import type {FormatterNotice,FormatterPackage} from '../formatting/packages.ts';

export const NPM_REGISTRY='https://registry.npmjs.org';
export const NPM_TYPE_LIMITS={archive:16_000_000,expanded:80_000_000,total:100_000_000,metadata:16_000_000,packages:64,files:20000};
export interface NpmTypeResult{name:string;version:string;description:string;included:boolean}
export interface NpmTypeLock{name:string;version:string;integrity:string;tarball:string;path:string}
export interface NpmTypeArtifact{item:FormatterPackage;bytes:ArrayBuffer}
export interface NpmTypeNoticeFallback{name:string;version:string;license:string;integrity:string;text:string}
interface Manifest{
  name:string;version:string;license?:string;description?:string;deprecated?:string;types?:string;typings?:string;typesVersions?:unknown;exports?:unknown;
  dependencies?:Record<string,string>;peerDependencies?:Record<string,string>;peerDependenciesMeta?:Record<string,{optional?:boolean}>;
  dist?:{tarball?:string;integrity?:string};
}
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export function registryUrl(value:string):URL{
  const url=new URL(value,NPM_REGISTRY);
  if(url.origin!==NPM_REGISTRY||url.username||url.password||url.hash)throw new Error('Only public npm registry downloads are supported.');
  return url;
}
export async function boundedBytes(stream:ReadableStream<Uint8Array>,maximum:number,signal?:AbortSignal):Promise<Uint8Array<ArrayBuffer>>{
  const reader=stream.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{for(;;){signal?.throwIfAborted();const {value,done}=await reader.read();if(done)break;length+=value.byteLength;
    if(length>maximum)throw new Error('This type package exceeds the supported download or expansion size.');chunks.push(value);
  }}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}return bytes;
}
async function download(url:URL,maximum:number,signal:AbortSignal,fetcher:typeof fetch,accept?:string):Promise<Uint8Array<ArrayBuffer>>{
  signal.throwIfAborted();const response=await fetcher(registryUrl(url.href),{credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]),...(accept?{headers:{Accept:accept}}:{})});
  if(!response.ok||!response.body)throw new Error(`npm could not provide this package (${response.status}).`);
  if(Number(response.headers.get('content-length'))>maximum){await response.body.cancel();throw new Error('This type package exceeds the supported download size.');}
  return boundedBytes(response.body,maximum,signal);
}
function hasTypes(value:Manifest):boolean{
  const typedExport=(item:unknown,depth=0):boolean=>Boolean(depth<10&&item&&typeof item==='object'&&(typeof (item as Record<string,unknown>).types==='string'||Object.values(item).some(child=>typedExport(child,depth+1))));
  return value.name.startsWith('@types/')||typeof value.types==='string'||typeof value.typings==='string'||Boolean(value.typesVersions)||typedExport(value.exports);
}
export async function searchNpmTypes(query:string,signal:AbortSignal,fetcher:typeof fetch=fetch):Promise<NpmTypeResult[]>{
  const text=query.trim().slice(0,160);if(!text)return [];
  const url=new URL('/-/v1/search',NPM_REGISTRY);url.searchParams.set('text',text.startsWith('@types/')?text:`@types/${text}`);url.searchParams.set('size','30');
  const body=JSON.parse(decoder.decode(await download(url,1_000_000,signal,fetcher))) as {objects?:{package?:{name?:string;version?:string;description?:string;deprecated?:string}}[]};
  const found=new Map<string,NpmTypeResult>();
  for(const {package:item}of body.objects??[]){if(item?.name?.startsWith('@types/')&&isNpmPackageName(item.name)&&!item.deprecated&&typeof item.version==='string')
    found.set(item.name,{name:item.name,version:item.version,description:item.description??'',included:false});}
  // An exact package query also finds declarations shipped by a library itself.
  if(isNpmPackageName(text)&&!text.startsWith('@types/')){
    try{const item=JSON.parse(decoder.decode(await download(new URL(`/${encodeURIComponent(text)}/latest`,NPM_REGISTRY),NPM_TYPE_LIMITS.metadata,signal,fetcher))) as Manifest;
      if(item.name===text&&!item.deprecated&&hasTypes(item))found.set(item.name,{name:item.name,version:item.version,description:item.description??'',included:true});
    }catch(error){signal.throwIfAborted();if(!(error instanceof Error)||!error.message.includes('(404)'))throw error;}
  }
  return [...found.values()].slice(0,30);
}
const base64=(bytes:Uint8Array)=>{let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));return btoa(binary);};
export async function sha256(bytes:Uint8Array<ArrayBuffer>):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');}
async function verifyIntegrity(bytes:Uint8Array<ArrayBuffer>,integrity:string){
  const hashes=integrity.split(/\s+/),preferred=['sha512','sha384','sha256'].find(algorithm=>hashes.some(item=>item.startsWith(`${algorithm}-`)));
  if(!preferred)throw new Error('npm did not supply a supported package integrity digest.');
  const actual=base64(new Uint8Array(await crypto.subtle.digest(preferred.toUpperCase().replace('SHA','SHA-'),bytes)));
  if(!hashes.includes(`${preferred}-${actual}`))throw new Error('The npm package integrity check failed. Nothing was installed.');
}
function tarText(bytes:Uint8Array){const end=bytes.indexOf(0);return decoder.decode(end<0?bytes:bytes.subarray(0,end));}
function tarNumber(bytes:Uint8Array):number{
  const text=tarText(bytes).trim();if(!/^[0-7]*$/.test(text))throw new Error('Unsupported archive number.');
  const value=parseInt(text||'0',8);if(!Number.isSafeInteger(value))throw new Error('Invalid archive size.');return value;
}
function archivePath(path:string):string{
  const normalized=path.replace(/^\.\//,'');
  if(normalized.startsWith('/')||/[\\\x00-\x1f:]/.test(normalized)||normalized.split('/').some(part=>part==='..'||part==='.'))throw new Error('The type archive contains an unsafe path.');
  return normalized;
}
function paxFields(bytes:Uint8Array):Record<string,string>{
  const result:Record<string,string>={};let offset=0;
  while(offset<bytes.length){const space=bytes.indexOf(32,offset);if(space<0)throw new Error('Invalid archive metadata.');
    const length=Number(decoder.decode(bytes.subarray(offset,space)));if(!Number.isSafeInteger(length)||length<=space-offset+1||offset+length>bytes.length)throw new Error('Invalid archive metadata.');
    const field=decoder.decode(bytes.subarray(space+1,offset+length-1)),equal=field.indexOf('=');
    if(equal>0&&['path','size'].includes(field.slice(0,equal)))result[field.slice(0,equal)]=field.slice(equal+1);offset+=length;
  }return result;
}
/** Extract inert declarations/metadata/notices only. No archive entry reaches a filesystem. */
export function declarationFiles(tar:Uint8Array):Map<string,string>{
  const files=new Map<string,string>();let offset=0,count=0,longName='';let local:Record<string,string>={},global:Record<string,string>={};
  while(offset+512<=tar.length){const header=tar.subarray(offset,offset+512);if(header.every(byte=>byte===0))return files;
    if(++count>NPM_TYPE_LIMITS.files)throw new Error('The type archive contains too many entries.');
    const checksum=header.reduce((sum,byte,index)=>sum+(index>=148&&index<156?32:byte),0);
    if(checksum!==tarNumber(header.subarray(148,156)))throw new Error('The type archive header checksum is invalid.');
    const kind=String.fromCharCode(header[156]!),metadata={...global,...local};
    const size=metadata.size!==undefined&&!['x','g','L'].includes(kind)?Number(metadata.size):tarNumber(header.subarray(124,136));
    if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw new Error('The type archive is truncated or invalid.');
    const bytes=tar.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512;
    if(kind==='x'||kind==='g'){if(size>65536)throw new Error('Archive metadata is too large.');const fields=paxFields(bytes);if(kind==='g')global=fields;else local=fields;continue;}
    if(kind==='L'){longName=tarText(bytes).replace(/\n$/,'');continue;}
    const prefix=tarText(header.subarray(345,500)),name=archivePath(metadata.path??(longName||[prefix,tarText(header.subarray(0,100))].filter(Boolean).join('/')));
    local={};longName='';if(kind!=='0'&&kind!=='\0')continue;
    const slash=name.indexOf('/');if(slash<0)continue;const relative=name.slice(slash+1);if(!relative)continue;
    if(relative==='package.json'||/\.d\.(?:ts|mts|cts)$/.test(relative)||/(?:^|\/)(?:licen[cs]e|copying|notice|copyright)(?:[._-].*)?$/i.test(relative)){
      if(files.has(relative))throw new Error('The type archive repeats a declaration path.');files.set(relative,decoder.decode(bytes));
    }
  }
  throw new Error('The type archive is truncated.');
}
export function validateDeclarationPaths(files:unknown,name:string):asserts files is Record<string,string>{
  if(!files||typeof files!=='object'||Array.isArray(files))throw new Error('Invalid type declarations.');
  const prefix=`/repository/node_modules/${name}/`,entries=Object.entries(files);
  if(entries.length>NPM_TYPE_LIMITS.files||!entries.some(([path])=>path.endsWith('.d.ts')||path.endsWith('.d.mts')||path.endsWith('.d.cts')))throw new Error('This package contains no supported type declarations.');
  for(const [path,text]of entries)if(!path.startsWith(prefix)||archivePath(path.slice(prefix.length))!==path.slice(prefix.length)||typeof text!=='string'||!/(?:\.d\.(?:ts|mts|cts)|(?:^|\/)package\.json)$/.test(path))throw new Error('Invalid type declaration path.');
}
export async function buildNpmTypeArtifact(name:string,signal:AbortSignal,onprogress:(message:string)=>void=()=>{},fetcher:typeof fetch=fetch,noticeFallbacks:readonly NpmTypeNoticeFallback[]=[]):Promise<NpmTypeArtifact>{
  if(!isNpmPackageName(name))throw new Error('Enter a valid npm package name.');
  const files:Record<string,string>={},notices:FormatterNotice[]=[],lock:NpmTypeLock[]=[];
  const queue=[{name,range:'latest'}],resolved=new Map<string,Manifest>();let total=0,root:Manifest|undefined;
  for(let position=0;position<queue.length;position++){
    signal.throwIfAborted();const request=queue[position]!;
    const previous=resolved.get(request.name);if(previous){if(request.range!=='latest'&&!satisfies(previous.version,request.range))throw new Error(`Incompatible declaration dependency versions for ${request.name}.`);continue;}
    if(resolved.size>=NPM_TYPE_LIMITS.packages)throw new Error('This declaration dependency graph exceeds the supported package count.');
    onprogress(`Reading ${request.name}…`);
    const exact=request.range==='latest'||/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(request.range);
    const metadataUrl=new URL(`/${encodeURIComponent(request.name)}${exact?`/${encodeURIComponent(request.range)}`:''}`,NPM_REGISTRY);
    const metadata=JSON.parse(decoder.decode(await download(metadataUrl,NPM_TYPE_LIMITS.metadata,signal,fetcher,exact?undefined:'application/vnd.npm.install-v1+json')));
    const version=exact?undefined:(metadata['dist-tags']?.[request.range]??maxSatisfying(Object.keys(metadata.versions??{}),request.range));
    // npm's compact version index omits declaration entrypoints. Read the exact
    // resolved manifest before deciding whether a dependency provides types.
    const item=(exact?metadata:version?JSON.parse(decoder.decode(await download(new URL(`/${encodeURIComponent(request.name)}/${encodeURIComponent(version)}`,NPM_REGISTRY),NPM_TYPE_LIMITS.metadata,signal,fetcher))):undefined) as Manifest|undefined;
    if(!item||item.name!==request.name||typeof item.version!=='string')throw new Error(`No compatible npm declaration version was found for ${request.name}.`);
    resolved.set(item.name,item);if(!root)root=item;
    if(item.name===name&&item.deprecated)throw new Error(`This package is deprecated: ${item.deprecated}`);
    if(item.name!==name&&!hasTypes(item))continue;
    if(!item.dist?.tarball||!item.dist.integrity)throw new Error(`npm integrity metadata is missing for ${item.name}.`);
    onprogress(`Downloading ${item.name} ${item.version}…`);
    const archive=await download(registryUrl(item.dist.tarball),NPM_TYPE_LIMITS.archive,signal,fetcher);await verifyIntegrity(archive,item.dist.integrity);
    const expanded=await boundedBytes(new Blob([archive]).stream().pipeThrough(new DecompressionStream('gzip')),NPM_TYPE_LIMITS.expanded,signal);
    total+=expanded.byteLength;if(total>NPM_TYPE_LIMITS.total)throw new Error('These declaration dependencies exceed the supported total size.');
    const entries=declarationFiles(expanded),manifest=JSON.parse(entries.get('package.json')??'null') as Manifest|null;
    if(manifest?.name!==item.name||manifest.version!==item.version)throw new Error('The npm archive identity does not match its metadata.');
    const base=item.name===name?`/repository/node_modules/${name}`:`/repository/node_modules/${name}/node_modules/${item.name}`;
    const licenses=[...entries].filter(([path])=>!path.endsWith('.d.ts')&&!path.endsWith('.d.mts')&&!path.endsWith('.d.cts')&&path!=='package.json');
    if(!licenses.length){
      const fallback=noticeFallbacks.find(fallback=>fallback.name===item.name&&fallback.version===item.version&&fallback.license===item.license&&fallback.license===manifest.license&&fallback.integrity===item.dist!.integrity&&fallback.text.trim());
      if(fallback)licenses.push(['reviewed notice supplement',fallback.text]);
    }
    if(!licenses.length)throw new Error(`${item.name} does not include a license or notice file.`);
    for(const [path,text]of licenses)notices.push({name:`${item.name} · ${path}`,version:item.version,text});
    for(const [path,text]of entries)if(/\.d\.(?:ts|mts|cts)$/.test(path)||path==='package.json')files[`${base}/${path}`]=text;
    lock.push({name:item.name,version:item.version,integrity:item.dist.integrity,tarball:item.dist.tarball,path:base});
    const referenced=referencedTypePackages([...entries].filter(([path])=>/\.d\.(?:ts|mts|cts)$/.test(path)).map(([,text])=>text));
    const dependencies={...item.dependencies,...Object.fromEntries(Object.entries(item.peerDependencies??{}).filter(([dependency])=>!item.peerDependenciesMeta?.[dependency]?.optional))};
    for(const [dependency,range]of Object.entries(dependencies)){
      if(!isNpmPackageName(dependency)||typeof range!=='string')throw new Error('Invalid npm declaration dependency.');
      if(dependency.startsWith('@types/')||referenced.has(dependency))queue.push({name:dependency,range});
    }
    if(queue.length>NPM_TYPE_LIMITS.packages*8)throw new Error('Too many declaration dependencies.');
  }
  validateDeclarationPaths(files,name);signal.throwIfAborted();
  const payload=encoder.encode(JSON.stringify(files));
  const bytes=encoder.encode(JSON.stringify({schema:1,id:npmTypeId(name),version:root!.version,kind:'data',payload:base64(payload),notices,npm:{name,lock}}));
  return {bytes:bytes.buffer,item:{id:npmTypeId(name),name,languages:'JavaScript, TypeScript, JSX, TSX',version:root!.version,kind:'data',github:'',bytes:bytes.length,payloadBytes:payload.length,sha256:await sha256(bytes),url:`https://www.npmjs.com/package/${name}`}};
}
