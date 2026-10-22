// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { EditorState, type Extension } from '@codemirror/state';
import { ViewPlugin, hoverTooltip } from '@codemirror/view';
import { linter, forceLinting } from '@codemirror/lint';
import { autocompletion, completeFromList, snippet, type Completion, type CompletionSource, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { filterCompletionGaps } from '../editor/completion-filter';
import { renderLanguageHover } from './hover';
import { LanguageSession } from './client';
import type { EngineRequest } from './catalog';
import type {TypeLibraryChoices} from './type-libraries';
export function languageIntelligence(engine:string,path:string,language:string,loadFiles:()=>Promise<Record<string,string>>,autocomplete:boolean,onerror:(message:string)=>void,loadPaths:()=>readonly string[]=()=>[],typeLibraries:TypeLibraryChoices={}):Extension {
  let disposed=false;
  const session=new LanguageSession(engine,()=>{if(!disposed)queueMicrotask(()=>{if(editor&&!disposed)forceLinting(editor);});},typeLibraries);
  let editor: import('@codemirror/view').EditorView | undefined;
  const request=async(state:EditorState,method:EngineRequest['method'],position:number)=>{
    try{
      if(!await session.prepare()||disposed)return {};
      const files={...await loadFiles(),[path]:state.sliceDoc()};
      if(disposed)return {};
      const result=await session.request({files,paths:[...loadPaths()],path,language,method,position});if(!disposed)onerror('');return result;}
    catch(error){if(!disposed)onerror(error instanceof Error?error.message:String(error));return {};}
  };
  const completionSource = async(context:CompletionContext):Promise<CompletionResult|null>=>{
      if(!context.explicit&&!context.matchBefore(/[\w$.-]+/))return null;
      const nativeCompletion=async()=>{
        for(const source of context.state.languageDataAt<CompletionSource | readonly Completion[]>('autocomplete',context.pos)){
          const fallback=await (typeof source==='function'?source:completeFromList(source))(context);
          if(disposed||context.aborted)return null;
          if(fallback?.options.length)return {...fallback,options:fallback.options.map(option=>
            option.label==='if'&&option.detail?.includes('else')?{...option,label:'if-else'}:option)};
        }
        return null;
      };
      const native=engine==='typescript'?await nativeCompletion():null;
      const conditionals=native?.options.filter(option=>['if','if-else'].includes(option.label)&&typeof option.apply==='function')??[];
      // Resolve conditional prefixes locally, before a worker or repository read.
      // Include `i` so the first keystroke cannot leave `if` waiting on a request.
      if(native&&conditionals.length&&/^if?$/.test(context.matchBefore(/[\w$]*/)?.text??'')){
        return {...native,validFor:/^i(?:f(?:-else)?)?$/,options:native.options};
      }
      const state=context.state,result=await request(state,'completion',context.pos);
      if(disposed||context.aborted)return null;
      const completions=result.completions?.filter(item=>engine!=='typescript'||item.detail!=='warning');
      if(!completions?.length){
        // One source owns the popup: native results are a fallback, never a
        // second list racing an asynchronous language-engine response.
        return native??await nativeCompletion();
      }
      // Filter on the typed word, not the earliest edit range: some providers
      // replace a leading dot or quote for an individual completion.
      const from=context.matchBefore(/[\w$-]*/)?.from??context.pos;
      const prefix=context.state.sliceDoc(from,context.pos);
      return {from,validFor:text=>text.startsWith(prefix)&&/^[\w$-]*$/.test(text),options:[...conditionals,...completions.filter(item=>!conditionals.some(option=>option.label===item.label)).map<Completion>(item=>({label:item.label,detail:item.detail??'',apply:(view, _completion, _from,to)=>{
        if(view.state.readOnly)return;
        const start=Math.max(0,_from+item.from-from);
        const end=Math.min(view.state.doc.length,to+Math.max(0,item.to-context.pos));
        if (item.snippet) {
          // LSP's bare numeric stops use braces in CodeMirror's snippet syntax.
          const template=(item.insert??item.label).replace(/\$(\d+)/g,'$${$1}');
          snippet(template)(view,_completion,start,end);return;
        }
        let insert=item.insert??item.label;
        let anchor=start+insert.length;
        if(engine==='typescript'&&['method','function'].includes(item.detail??'')&&!insert.includes('(')){
          const existing=view.state.sliceDoc(end).match(/^[ \t]*\(/);
          if(existing)anchor+=existing[0].length;
          else{insert+='()';anchor++;}
        }
        view.dispatch({changes:{from:start,to:end,insert},selection:{anchor},userEvent:'input.complete'});
      }}))]};
    };
  return [
    ViewPlugin.define(view=>{editor=view;void session.prepare().then(ready=>{if(ready&&!disposed)void loadFiles().catch(()=>{});}).catch(()=>{});return{destroy(){disposed=true;session.dispose();}};}),
    linter(async view=>{
      const state=view.state,result=await request(state,'diagnostics',0);
      return disposed||view.state.doc!==state.doc?[]:(result.diagnostics??[]).map(item=>({...item,from:Math.max(0,Math.min(state.doc.length,item.from)),to:Math.max(0,Math.min(state.doc.length,item.to))}));
    },{delay:400}),
    autocomplete?autocompletion({override:[async context=>filterCompletionGaps(await completionSource(context),context)]}):[],
    hoverTooltip(async(view,position)=>{
      const state=view.state,result=await request(state,'hover',position),hover=result.hover;
      if(disposed||view.state.doc!==state.doc||!hover?.text)return null;
      const dom=renderLanguageHover(hover.text,engine);
      return dom?{pos:hover.from,end:hover.to,create(){return{dom};}}:null;
    }),
  ];
}
