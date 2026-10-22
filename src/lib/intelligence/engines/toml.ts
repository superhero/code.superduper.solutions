// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {TaploLsp,type RpcMessage} from '@taplo/lsp';
import {doc,result,uri,filePath} from './common';
import type {EngineRequest} from '../catalog';
import type {CompletionItem,CompletionList,Diagnostic,Hover} from 'vscode-languageserver-types';
let ready:Promise<TaploLsp>|undefined,service:TaploLsp,files:Record<string,string>={},sequence=0,documentVersion=0;
const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
const opened=new Set<string>();
let diagnosticReceiver:((items:Diagnostic[])=>void)|undefined;
function notify(method:string,params:unknown){service.send({jsonrpc:'2.0',method,params});}
function call(method:string,params:unknown):Promise<any>{return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});service.send({jsonrpc:'2.0',id,method,params});});}
function message(value:RpcMessage){
 if(typeof value.id==='number'&&pending.has(value.id)){const item=pending.get(value.id)!;pending.delete(value.id);value.error?item.reject(new Error(value.error.message)):item.resolve(value.result);}
 else if(value.method==='textDocument/publishDiagnostics')diagnosticReceiver?.(value.params.diagnostics);
 else if(value.id!==undefined)service.send({jsonrpc:'2.0',id:value.id,result:value.method==='workspace/configuration'?(value.params.items??[]).map(()=>({schema:{catalogs:[]},configFile:{enabled:false}})):null});
}
async function initialize(){
 // Taplo uses global fetch internally. Permit repository-local schema reads only.
 globalThis.fetch=async input=>{
  const address=String(input instanceof Request?input.url:input);
  if(!address.startsWith('file:///repository/'))throw new Error('Only repository-local schemas are available.');
  const source=files[filePath(address)];return new Response(source??'',{status:source===undefined?404:200});
 };
 service=await TaploLsp.initialize({now:()=>new Date(),envVar:()=>undefined,envVars:()=>[],stdErrAtty:()=>false,
 stdin:async()=>new Uint8Array(),stdout:async (bytes:Uint8Array)=>bytes.length,stderr:async (bytes:Uint8Array)=>bytes.length,
 glob:()=>[],readFile:async path=>{const source=files[path.replace(/^\/repository\//,'')];if(source===undefined)throw new Error('Local file not found.');return new TextEncoder().encode(source);},
 writeFile:async()=>{throw new Error('Language analysis is read-only.');},urlToFilePath:url=>decodeURIComponent(new URL(url).pathname),isAbsolute:path=>path.startsWith('/'),cwd:()=>'/repository',findConfigFile:()=>undefined
 },{onMessage:message});
 await call('initialize',{processId:null,rootUri:'file:///repository/',capabilities:{},initializationOptions:{configuration:{schema:{catalogs:[]},configFile:{enabled:false}}}});notify('initialized',{});return service;
}
export async function run(request:EngineRequest){
 files=request.files;await(ready??=initialize());const document=doc(request),address=uri(request.path),version=++documentVersion;
 const diagnostics=await new Promise<Diagnostic[]>((resolve,reject)=>{
  const timeout=setTimeout(()=>{diagnosticReceiver=undefined;reject(new Error('Taplo analysis timed out.'));},10_000);
  diagnosticReceiver=items=>{clearTimeout(timeout);diagnosticReceiver=undefined;resolve(items);};
  if(opened.has(address))notify('textDocument/didChange',{textDocument:{uri:address,version},contentChanges:[{text:document.getText()}]});
  else {opened.add(address);notify('textDocument/didOpen',{textDocument:{uri:address,languageId:'toml',version,text:document.getText()}});}
 });
 if(request.method==='diagnostics')return result(request,{diagnostics});
 const response=await call(request.method==='hover'?'textDocument/hover':'textDocument/completion',{textDocument:{uri:address},position:document.positionAt(request.position)});
 return result(request,request.method==='hover'?{hover:response as Hover}:{completions:Array.isArray(response)?response as CompletionItem[]:(response as CompletionList)?.items??[]});
}
