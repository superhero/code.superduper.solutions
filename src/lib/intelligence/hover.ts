// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import {highlightHoverCode} from './hover-highlighting';
import {renderHoverMarkdown} from './hover-markdown';

/** Keep service text inert while giving signatures and prose distinct structure. */
export function renderLanguageHover(text:string,engine:string):HTMLElement|null {
  if(!text.trim())return null;
  const root=document.createElement('div');root.className='cm-language-hover';
  let hasContent=false;
  let documentation=text;
  if(engine==='typescript'){
    // An empty first line means documentation without a signature. Keep it until splitting.
    const newline=documentation.indexOf('\n');
    let signature=(newline<0?documentation:documentation.slice(0,newline)).trim();
    documentation=newline<0?'':documentation.slice(newline+1);
    const kind=signature.match(/^\(([^)]+)\)\s*/);
    const overload=signature.match(/\s*\(\+\d+ overloads?\)$/);
    if(kind||overload){
      const metadata=root.appendChild(document.createElement('div'));metadata.className='cm-hover-metadata';
      for(const label of [kind?.[1],overload?.[0].trim().slice(1,-1)])if(label){
        const badge=metadata.appendChild(document.createElement('span'));badge.textContent=label;
      }
    }
    if(overload)signature=signature.slice(0,-overload[0].length);
    if(kind)signature=signature.slice(kind[0].length);
    if(signature.trim()){
      const code=root.appendChild(document.createElement('pre'));code.className='cm-hover-signature';
      const content=code.appendChild(document.createElement('code'));content.textContent=signature;
      highlightHoverCode(content,'typescript',true);hasContent=true;
    }
  }
  documentation=documentation.trim();
  if(documentation){
    const description=document.createElement('div');description.className='cm-hover-description';
    description.innerHTML=renderHoverMarkdown(documentation);
    if(description.textContent?.trim()){
      root.appendChild(description);hasContent=true;
      for(const code of description.querySelectorAll<HTMLElement>('pre code')){
        const language=Array.from(code.classList).find(name=>name.startsWith('language-'))?.slice(9);
        if(language)highlightHoverCode(code,language);
      }
    }
  }
  return hasContent?root:null;
}
