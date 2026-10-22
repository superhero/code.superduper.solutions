// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import ts from 'typescript';
import standardLibraries from 'virtual:typescript-libraries';
import type { EngineRequest, EngineResult } from '../catalog';
let current: Record<string,string> = {};
let libraries=standardLibraries;
/** Optional declarations arrive as verified data before the first analysis request. */
export function setTypeLibraries(value:Record<string,string>,payloads:string[]=[]){
  libraries={...standardLibraries,...value};
  for(const payload of payloads){const binary=atob(payload),bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));Object.assign(libraries,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}
}
const revisions = new Map<string,number>();
const defaults: ts.CompilerOptions = { allowJs: true, checkJs: false, noEmit: true, strict: true, target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.Preserve, skipLibCheck: true, allowImportingTsExtensions: true };
let options = { ...defaults };
const host: ts.LanguageServiceHost = {
  getCompilationSettings: ()=>options, getScriptFileNames: ()=>Object.keys(current).filter(path=>/\.[cm]?[jt]sx?$/.test(path)),
  getScriptVersion: path=>String(revisions.get(path)??0), getScriptSnapshot: path=>{
    const source = current[path] ?? libraries[path]; return source === undefined ? undefined : ts.ScriptSnapshot.fromString(source);
  }, getCurrentDirectory: ()=>'/repository', getDefaultLibFileName: ()=>'/lib/lib.esnext.d.ts',
  fileExists: path=>Object.hasOwn(current,path)||Object.hasOwn(libraries,path), readFile: path=>current[path]??libraries[path],
  directoryExists: path=>[...Object.keys(current),...Object.keys(libraries)].some(file=>file.startsWith(path.replace(/\/$/,'')+'/')),
  readDirectory: ()=>[], getDirectories: ()=>[], useCaseSensitiveFileNames: ()=>true,
};
const service = ts.createLanguageService(host);
export async function run(request: EngineRequest): Promise<EngineResult> {
  const extension=request.language==='jsx'?'jsx':request.language==='tsx'?'tsx':request.language==='javascript'?(/\.jsx$/.test(request.path)?'jsx':'js'):(/\.tsx$/.test(request.path)?'tsx':'ts');
  const compatible=extension==='js'?/\.[cm]?js$/.test(request.path):extension==='ts'?/\.[cm]?ts$/.test(request.path):request.path.endsWith('.'+extension);
  // Keep relative imports in the same directory. Only the analysis snapshot gets
  // an extension alias when a custom suffix selects a different script kind.
  let analysisPath=compatible?request.path:request.path+'.'+extension;
  let sequence=0;
  while(!compatible&&Object.hasOwn(request.files,analysisPath))analysisPath=request.path+'.__editor'+(++sequence)+'.'+extension;
  const files={...request.files,[analysisPath]:request.files[request.path]??''};
  if(analysisPath!==request.path)delete files[request.path];
  const next = Object.fromEntries(Object.entries(files).map(([path,value])=>['/repository/'+path,value]));
  for (const path of new Set([...Object.keys(current),...Object.keys(next)])) if (current[path] !== next[path]) revisions.set(path,(revisions.get(path)??0)+1);
  current = next; options = { ...defaults,lib:['lib.esnext.d.ts',
    ...['dom','dom.iterable','dom.asynciterable','webworker','webworker.iterable','webworker.asynciterable','webworker.importscripts','scripthost']
      .filter(name=>Object.hasOwn(libraries,`/lib/lib.${name}.d.ts`)).map(name=>`lib.${name}.d.ts`)] };
  const config = current['/repository/tsconfig.json'] ?? current['/repository/jsconfig.json'];
  // Read data-only compiler settings. Never execute repository configuration.
  if (config) { const parsed = ts.parseConfigFileTextToJson('tsconfig.json',config); Object.assign(options,
    { ...ts.convertCompilerOptionsFromJson(parsed.config?.compilerOptions ?? {},'/repository').options, noEmit:true, skipLibCheck:true }); }
  if(options.types===undefined){
    options.types=Object.keys(libraries).flatMap(path=>path.match(/^\/repository\/node_modules\/@types\/([^/]+)\/package\.json$/)?.[1]??[]);
  }
  const path = '/repository/'+analysisPath, position = request.position;
  if (request.method === 'diagnostics') return { diagnostics: [...service.getSyntacticDiagnostics(path),...service.getSemanticDiagnostics(path)].map(item=>({
    from:item.start??0,to:(item.start??0)+(item.length??0),severity:item.category===ts.DiagnosticCategory.Error?'error':'warning',message:ts.flattenDiagnosticMessageText(item.messageText,'\n') })) };
  if (request.method === 'hover') { const info = service.getQuickInfoAtPosition(path,position); return info ? { hover:{from:info.textSpan.start,to:info.textSpan.start+info.textSpan.length,text:ts.displayPartsToString(info.displayParts)+'\n'+ts.displayPartsToString(info.documentation)} } : {}; }
  const info = service.getCompletionsAtPosition(path,position,{ includeCompletionsForModuleExports:false, includeCompletionsWithInsertText:true });
  const word = (request.files[request.path]??'').slice(0,position).match(/[\w$]*$/)?.[0]??'';
  return { completions:(info?.entries??[]).filter(item=>!item.isSnippet).slice(0,300).map(item=>({label:item.name,detail:item.kind,insert:item.insertText??item.name,
    from:item.replacementSpan?.start??position-word.length,to:item.replacementSpan?item.replacementSpan.start+item.replacementSpan.length:position})) };
}

