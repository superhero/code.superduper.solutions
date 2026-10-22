// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {LanguageDescription} from '@codemirror/language';
import {highlightTree} from '@lezer/highlight';
import {languageDescriptions} from '../editor/languages';
import {syntaxHighlightStyle} from '../editor/highlighting';

/** Reuse lazy editor parsers and palette classes; never interpret service text as HTML. */
export function highlightHoverCode(element:HTMLElement,language:string,signature=false):void {
  const description=LanguageDescription.matchLanguageName(languageDescriptions,language);
  if(!description)return;
  const text=element.textContent??'';
  void description.load().then(support=>{
    if(element.textContent!==text)return;
    // Quick-info method signatures omit their declaration context. Supply it
    // to the parser while keeping every displayed character unchanged.
    let prefix='',source=text,suffix='';
    if(signature&&!/^(?:declare|function|class|interface|type|var|let|const|enum|namespace|import|export)\b/.test(text)){
      if(/^[\w$.]+(?:<[^>]+>)?\(/.test(text)){
        prefix='declare function ';
        const paren=text.indexOf('(');source=text.slice(0,paren).replace(/\./g,'_')+text.slice(paren);
      }else if(/^[\w$]+\??\s*:/.test(text))prefix='declare const ';
      else {prefix='interface __Hover { ';suffix=' }';}
    }
    const fragment=document.createDocumentFragment();let position=0;
    highlightTree(support.language.parser.parse(prefix+source+suffix),syntaxHighlightStyle,(from,to,classes)=>{
      from=Math.max(0,from-prefix.length);to=Math.min(text.length,to-prefix.length);
      if(to<=from)return;
      if(from>position)fragment.append(document.createTextNode(text.slice(position,from)));
      const span=document.createElement('span');span.className=classes;span.textContent=text.slice(from,to);fragment.append(span);position=to;
    });
    if(position<text.length)fragment.append(document.createTextNode(text.slice(position)));
    element.replaceChildren(fragment);
  }).catch(()=>{/* Documentation remains readable if its parser is unavailable. */});
}
