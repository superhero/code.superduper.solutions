// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {startServer,getConnection,allChecks,recommendedChecks,FileType,type AbstractFileSystem,type Dependencies,type ThemeCheckConfig} from '@shopify/theme-language-server-browser';
import documents from 'virtual:liquid-docs';
import {parseDocument} from 'yaml';
import {doc,result,uri} from './common';
import type {EngineRequest} from '../catalog';
import type {Diagnostic,CompletionItem,CompletionList,Hover} from 'vscode-languageserver-types';
const root='file:///repository/',schemaRoot='https://raw.githubusercontent.com/Shopify/theme-liquid-docs/main/schemas/';
let files:Record<string,string>={},previousFiles:Record<string,string>={},ready:Promise<void>|undefined,client:MessagePort,sequence=0,version=0;
let paths=new Set<string>(),previousPaths=new Set<string>();
const opened=new Set<string>(),pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
let diagnosticReceiver:((value:{uri:string;version?:number;diagnostics:Diagnostic[]})=>void)|undefined;
function pathOf(address:string){if(!address.startsWith(root))throw new Error('Only repository-local files are available.');return decodeURIComponent(new URL(address).pathname).replace(/^\/repository\//,'').replace(/\/$/,'');}
function hasFile(path:string){return Object.hasOwn(files,path)||paths.has(path);}
const fs:AbstractFileSystem={
 async stat(address){
  if(address===root||address===root.slice(0,-1))return {type:FileType.Directory,size:0};
  const path=pathOf(address);
  // An implicit root marker is host metadata for standalone Liquid files. It is never persisted.
  if(path==='.theme-check.yml'&&!hasFile(path))return {type:FileType.File,size:0};
  if(hasFile(path))return {type:FileType.File,size:new TextEncoder().encode(files[path]??'').length};
  if([...paths].some(file=>file.startsWith(path+'/')))return {type:FileType.Directory,size:0};
  throw new Error('Repository file not found.');
 },
 async readFile(address){const path=pathOf(address);if(path==='.theme-check.yml'&&!hasFile(path))return '';if(!hasFile(path))throw new Error('Repository file not found.');return files[path]??'';},
 async readDirectory(address){
  const path=address===root||address===root.slice(0,-1)?'':pathOf(address),prefix=path?path+'/':'',children=new Map<string,FileType>();
  for(const file of paths){if(!file.startsWith(prefix))continue;const rest=file.slice(prefix.length),name=rest.split('/')[0]!;if(name)children.set(prefix+name,rest.includes('/')?FileType.Directory:FileType.File);}
  return [...children].map(([path,type])=>[uri(path),type]);
 }
};
async function loadConfig(address:string):Promise<ThemeCheckConfig>{
 const directory=address.replace(/\/$/,''),configPath=pathOf(directory+'/.theme-check.yml');
 const parsed=parseDocument(files[configPath]??'',{uniqueKeys:true});if(parsed.errors.length)throw new Error('Invalid .theme-check.yml.');
 const config=parsed.toJS()??{};
 if(typeof config!=='object'||Array.isArray(config))throw new Error('.theme-check.yml must contain a mapping.');
 if(config.extends!==undefined&&!['theme-check:recommended','theme-check:all','theme-check:theme-app-extension'].includes(config.extends))throw new Error('Only bundled Theme Check profiles are supported.');
 const recommended=new Set(recommendedChecks.map(check=>check.meta.code));
 const appProfile=config.extends==='theme-check:theme-app-extension';
 const settings:ThemeCheckConfig['settings']=Object.fromEntries(allChecks.map(check=>[check.meta.code,{enabled:config.extends==='theme-check:all'||(appProfile?check.meta.targets?.some(target=>target==='theme-app-extension'):recommended.has(check.meta.code))===true}]));
 for(const [name,value]of Object.entries(config)){
  if(['extends','root','ignore'].includes(name))continue;
  const check=allChecks.find(check=>check.meta.code===name||check.meta.aliases?.includes(name));if(!check)throw new Error(`Unsupported Theme Check option: ${name}`);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`Invalid Theme Check settings: ${name}`);
  const options={...value} as Record<string,unknown>;
  if(options.enabled!==undefined&&typeof options.enabled!=='boolean')throw new Error('Theme Check enabled must be a boolean.');
  if(typeof options.severity==='string'){const severity={error:0,warning:1,info:2}[options.severity];if(severity===undefined)throw new Error('Unknown Theme Check severity.');options.severity=severity;}
  settings[check.meta.code]={enabled:settings[check.meta.code]?.enabled??true,...settings[check.meta.code],...options};
 }
 if(config.root!==undefined&&typeof config.root!=='string')throw new Error('Theme Check root must be a relative path.');
 const rootUri=config.root===undefined?directory:new URL(String(config.root).replaceAll('\\','/')+'/',directory+'/').href.replace(/\/$/,'');
 if(rootUri!==root.slice(0,-1)&&!rootUri.startsWith(root))throw new Error('Theme Check root must stay in the repository.');
 if(config.ignore!==undefined&&(!Array.isArray(config.ignore)||config.ignore.some((item:unknown)=>typeof item!=='string')))throw new Error('Theme Check ignore must be an array of paths.');
 return {rootUri,context:hasFile(pathOf(directory+'/shopify.extension.toml'))?'app':'theme',checks:allChecks,settings,...(config.ignore?{ignore:config.ignore}:{})};
}
function notify(method:string,params:unknown){client.postMessage({jsonrpc:'2.0',method,params});}
function call(method:string,params:unknown):Promise<any>{return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});client.postMessage({jsonrpc:'2.0',id,method,params});});}
async function initialize(){
 const channel=new MessageChannel();client=channel.port2;
 client.onmessage=event=>{
  const message=event.data,item=pending.get(message.id);
  if(item){pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}
  else if(message.method==='textDocument/publishDiagnostics')diagnosticReceiver?.(message.params);
  else if(message.id!==undefined)client.postMessage({jsonrpc:'2.0',id:message.id,result:null});
 };
 const json=(path:string)=>JSON.parse(documents[path]!);
 const dependencies:Dependencies={fs,loadConfig,
  themeDocset:{filters:async()=>json('data/filters.json'),objects:async()=>json('data/objects.json'),liquidDrops:async()=>json('data/objects.json'),tags:async()=>json('data/tags.json'),systemTranslations:async()=>json('data/shopify_system_translations.json')},
  jsonValidationSet:{schemas:async mode=>json(mode==='app'?'schemas/manifest_theme_app_extension.json':'schemas/manifest_theme.json').schemas.map((entry:{uri:string;fileMatch?:string[]})=>({...entry,uri:schemaRoot+entry.uri,schema:documents['schemas/'+entry.uri]!}))}
 };
 const worker=channel.port1 as unknown as Worker;
 startServer(worker,dependencies,getConnection(worker));
 await call('initialize',{processId:null,rootUri:root,capabilities:{textDocument:{completion:{completionItem:{snippetSupport:true,documentationFormat:['plaintext']}},hover:{contentFormat:['plaintext']}}},initializationOptions:{'themeCheck.preloadOnBoot':true}});
 notify('initialized',{});
}
export async function run(request:EngineRequest){
 const servicePath=/\.liquid$/.test(request.path)&&!/\.(s?css|js)\.liquid$/.test(request.path)?request.path:request.path+'.html.liquid';
 files=servicePath===request.path?request.files:{...request.files,[servicePath]:request.files[request.path]??''};
 paths=new Set([...(request.paths??[]),...Object.keys(files)]);
 let directory=request.path.includes('/')?request.path.slice(0,request.path.lastIndexOf('/')):'';
 while(directory&&!hasFile(directory+'/.theme-check.yml')&&!hasFile(directory+'/shopify.extension.toml'))directory=directory.includes('/')?directory.slice(0,directory.lastIndexOf('/')):'';
 await loadConfig(directory?uri(directory):root);
 await(ready??=initialize());const document=doc(request),address=uri(servicePath),currentVersion=++version;
 const changes=[...new Set([...previousPaths,...paths])].filter(path=>previousFiles[path]!==files[path]||previousPaths.has(path)!==paths.has(path)).map(path=>({uri:uri(path),type:!hasFile(path)?3:!previousPaths.has(path)?1:2}));
 previousFiles={...files};previousPaths=new Set(paths);if(changes.length)notify('workspace/didChangeWatchedFiles',{changes});
 const diagnostics=await new Promise<Diagnostic[]>((resolve,reject)=>{
  const timeout=setTimeout(()=>{diagnosticReceiver=undefined;reject(new Error('Liquid analysis timed out.'));},12_000);
  diagnosticReceiver=value=>{if(value.uri!==address||value.version!==currentVersion)return;clearTimeout(timeout);diagnosticReceiver=undefined;resolve(value.diagnostics);};
  if(opened.has(address))notify('textDocument/didChange',{textDocument:{uri:address,version:currentVersion},contentChanges:[{text:document.getText()}]});
  else {opened.add(address);notify('textDocument/didOpen',{textDocument:{uri:address,languageId:'liquid',version:currentVersion,text:document.getText()}});}
 });
 if(request.method==='diagnostics')return result(request,{diagnostics});
 const response=await call(request.method==='hover'?'textDocument/hover':'textDocument/completion',{textDocument:{uri:address},position:document.positionAt(request.position)});
 return result(request,request.method==='hover'?{hover:response as Hover}:{completions:Array.isArray(response)?response as CompletionItem[]:(response as CompletionList)?.items??[]});
}
