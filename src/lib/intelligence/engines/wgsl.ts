// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {TextDocument} from 'vscode-languageserver-textdocument';
import {initialize,sendMessage} from 'wgslender-lsp';
import {bytes} from 'virtual:engine-resources';
import {doc,result,uri} from './common';
import type {EngineRequest} from '../catalog';
import type {CompletionItem,CompletionList,Diagnostic,Hover} from 'vscode-languageserver-types';
let ready:Promise<void>|undefined,sequence=0;
function send(method:string,params:unknown,id?:number):any[]{return sendMessage(JSON.stringify({jsonrpc:'2.0',method,params,...(id===undefined?{}:{id})})).map(value=>JSON.parse(value));}
export async function run(request:EngineRequest){
 await(ready??=WebAssembly.compile(bytes('wgsl')).then(async wasmModule=>{await initialize({wasmModule});send('initialize',{capabilities:{},rootUri:'file:///repository'},++sequence);send('initialized',{});}));
 const document=doc(request),address=uri(request.path);
 // Each request gets a fresh document, avoiding stale diagnostics after undo.
 send('textDocument/didClose',{textDocument:{uri:address}});
 const messages=send('textDocument/didOpen',{textDocument:{uri:address,languageId:'wgsl',version:document.version,text:document.getText()}});
 if(request.method==='diagnostics')return result(request,{diagnostics:messages.filter(item=>item.method==='textDocument/publishDiagnostics').flatMap(item=>item.params.diagnostics) as Diagnostic[]});
 const id=++sequence,response=send(request.method==='hover'?'textDocument/hover':'textDocument/completion',{textDocument:{uri:address},position:document.positionAt(request.position)},id).find(item=>item.id===id)?.result;
 return result(request,request.method==='hover'?{hover:response as Hover}:{completions:Array.isArray(response)?response as CompletionItem[]:(response as CompletionList)?.items??[]});
}
export async function format(source:string,options:{tabWidth:number;useTabs:boolean}):Promise<string>{
 const request:EngineRequest={path:'format.wgsl',files:{'format.wgsl':source},language:'wgsl',method:'diagnostics',position:0};
 await run(request);const id=++sequence;
 const edits=send('textDocument/formatting',{textDocument:{uri:uri(request.path)},options:{tabSize:options.tabWidth,insertSpaces:!options.useTabs}},id).find(item=>item.id===id)?.result;
 if(!Array.isArray(edits))throw new Error('WGSL formatting did not return edits.');
 return TextDocument.applyEdits(doc(request),edits);
}
