// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { ensureSyntaxTree, foldService, indentService, LanguageSupport, type LRLanguage } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { Tree } from '@lezer/common';
interface Block { name: string; from: number; openEnd: number; closeStart?: number; to: number }
const cached = new WeakMap<EditorState, { tree: Tree; blocks: Block[] }>();
/** Both published parsers carry unreachable Jinja `Conditional` properties.
 * Supply Handlebars block behavior independently, retaining their HTML overlay. */
function blocks(state: EditorState): Block[] {
  const tree=ensureSyntaxTree(state,state.doc.length,25);
  if(!tree)return [];
  const existing=cached.get(state);if(existing?.tree===tree)return existing.blocks;
  const output:Block[]=[],stack:Block[]=[];
  tree.iterate({enter(node){
    if(['RawBlock','BlockComment','OnelineComment','Escape'].includes(node.name))return false;
    if(node.name!=='Insert')return;
    const source=state.sliceDoc(node.from,node.to);
    const match=/^\{\{~?\s*([#^/])\s*(?:>\s*)?([^\s{}~()]+)/.exec(source);
    if(!match)return false;
    const [,kind,rawName]=match;
    const name=rawName!.replace(/^\*/, '');
    if(kind==='/'){
      const block=stack.at(-1);
      if(block && block.name===name){stack.pop();block.closeStart=node.from;block.to=node.to;}
    }else{
      const block={name:name!,from:node.from,openEnd:node.to,to:state.doc.length};
      stack.push(block);output.push(block);
    }
    return false;
  }});
  cached.set(state,{tree,blocks:output});return output;
}
export function handlebarsSupport(language: LRLanguage): LanguageSupport {
  return new LanguageSupport(language,[
    foldService.of((state,from,to)=>{
      const block=blocks(state).find(block=>block.from>=from&&block.from<=to&&block.closeStart!==undefined&&state.doc.lineAt(block.closeStart).number>state.doc.lineAt(block.openEnd).number);
      return block ? {from:block.openEnd,to:block.closeStart!} : null;
    }),
    indentService.of((context,pos)=>{
      const state=context.state,line=state.doc.lineAt(pos),before=state.doc.lineAt(Math.max(0,line.from-1));
      const ownBlocks=blocks(state);
      const closing=/^\s*\{\{~?\s*\//.test(line.text),middle=/^\s*\{\{~?\s*(?:else\b|\^\s*~?\}\})/.test(line.text);
      if(closing||middle){
        const block=ownBlocks.filter(block=>block.openEnd<line.from&&block.to>=line.from).at(-1);
        if(block)return context.lineIndent(block.from);
      }
      const opened=ownBlocks.filter(block=>block.from>=before.from&&block.from<=before.to&&block.openEnd<=line.from&&block.to>=line.from).at(-1);
      if(opened)return context.lineIndent(opened.from)+context.unit;
      if(/^\s*\{\{~?\s*(?:else\b|\^\s*~?\}\})/.test(before.text))return context.lineIndent(before.from)+context.unit;
      return undefined;
    })
  ]);
}
