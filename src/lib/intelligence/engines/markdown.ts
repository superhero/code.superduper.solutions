// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { createLanguageService, LogLevel, DiagnosticLevel, type IWorkspace, type ISlug } from 'vscode-markdown-languageservice';
import { CancellationToken } from 'vscode-languageserver-protocol/browser';
import { URI } from 'vscode-uri';
import MarkdownIt from 'markdown-it';
import GithubSlugger, { slug } from 'github-slugger';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { doc, result, uri, filePath } from './common';
import type { EngineRequest } from '../catalog';
const parser = new MarkdownIt({ html:false });
const event: IWorkspace['onDidChangeMarkdownDocument'] = () => ({dispose(){}});
const asSlug = (value:string):ISlug=>({value,equals:other=>value===other.value});
export async function run(request: EngineRequest) {
  const documents = Object.entries(request.files).filter(([path])=>path===request.path||/\.(md|markdown)$/i.test(path))
    .map(([path,content])=>TextDocument.create(uri(path),'markdown',1,content));
  const workspace: IWorkspace = {
    workspaceFolders:[URI.parse('file:///repository/')],onDidChangeMarkdownDocument:event,onDidCreateMarkdownDocument:event,onDidDeleteMarkdownDocument:()=>({dispose(){}}),
    getAllMarkdownDocuments:async()=>documents, hasMarkdownDocument:resource=>documents.some(document=>document.uri===resource.toString()),
    openMarkdownDocument:async resource=>documents.find(document=>document.uri===resource.toString()),
    stat:async resource=>Object.hasOwn(request.files,filePath(resource.toString())) ? {isDirectory:false} : Object.keys(request.files).some(path=>path.startsWith(filePath(resource.toString()).replace(/\/$/,'')+'/')) ? {isDirectory:true} : undefined,
    readDirectory:async resource=>{
      const directory=filePath(resource.toString()).replace(/\/$/,''),prefix=directory?directory+'/':'',entries=new Map<string,{isDirectory:boolean}>();
      for(const path of Object.keys(request.files)) if(path.startsWith(prefix)){const rest=path.slice(prefix.length),name=rest.split('/')[0]!;entries.set(name,{isDirectory:rest.includes('/')});}
      return [...entries];
    }
  };
  const service=createLanguageService({workspace,parser:{tokenize:async document=>parser.parse(document.getText(),{}),slugifier:{fromHeading:value=>asSlug(slug(value)),fromFragment:value=>asSlug(value),createBuilder:()=>{const builder=new GithubSlugger();return{add:value=>asSlug(builder.slug(value))};}}},logger:{level:LogLevel.Off,log(){}}});
  const document=doc(request),position=document.positionAt(request.position),token=CancellationToken.None;
  try { return result(request,request.method==='completion'?{completions:await service.getCompletionItems(document,position,{},token)}
    :request.method==='hover'?{hover:await service.getHover(document,position,token)}
    :{diagnostics:await service.computeDiagnostics(document,{validateReferences:DiagnosticLevel.warning,validateFragmentLinks:DiagnosticLevel.warning,validateFileLinks:DiagnosticLevel.warning,validateMarkdownFileLinkFragments:DiagnosticLevel.warning,validateUnusedLinkDefinitions:DiagnosticLevel.ignore,validateDuplicateLinkDefinitions:DiagnosticLevel.warning,ignoreLinks:[]},token)});
  } finally {service.dispose();}
}
