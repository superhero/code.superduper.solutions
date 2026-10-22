// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {ViewPlugin} from '@codemirror/view';

/** Style gaps using CodeMirror's actual fuzzy matches, without changing ranking. */
export const completionLabels=ViewPlugin.fromClass(class {
  readonly observer:MutationObserver;
  constructor(view:import('@codemirror/view').EditorView){
    this.observer=new MutationObserver(()=>{
      for(const label of view.dom.querySelectorAll('.cm-completionLabel')){
        const matches=label.querySelectorAll('.cm-completionMatchedText');
        if(matches.length<2)continue;
        let between=false;
        for(const node of Array.from(label.childNodes)){
          if(node===matches[0])between=true;
          if(node===matches[matches.length-1])break;
          if(between&&node.nodeType===Node.TEXT_NODE&&node.textContent){
            const gap=document.createElement('span');
            gap.className='cm-completionMatchGap';gap.textContent=node.textContent;
            node.replaceWith(gap);
          }
        }
      }
    });
    this.observer.observe(view.dom,{childList:true,subtree:true});
  }
  destroy(){this.observer.disconnect();}
});
