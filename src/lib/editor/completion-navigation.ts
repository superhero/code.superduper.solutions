// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Prec} from '@codemirror/state';
import {ViewPlugin,keymap,type EditorView,type ViewUpdate, type Command} from '@codemirror/view';
import {completionKeymap,completionStatus,selectedCompletionIndex,startCompletion,acceptCompletion,closeCompletion} from '@codemirror/autocomplete';
import {shortcutsFor,type KeybindingChoices,type KeybindingAction} from './keybindings';
/** Visible pending results must never send navigation or acceptance keys to the document. */
const pendingNavigation=ViewPlugin.fromClass(class {
  commands:Command[]=[];
  scheduled=false;
  destroyed=false;
  readonly view:EditorView;
  constructor(view:EditorView){this.view=view;}
  update(update:ViewUpdate){
    if(update.docChanged||update.selectionSet||completionStatus(update.state)===null)this.commands=[];
    if(!this.commands.length||this.scheduled||selectedCompletionIndex(update.state)===null)return;
    this.scheduled=true;
    queueMicrotask(()=>{
      this.scheduled=false;if(this.destroyed)return;
      while(this.commands.length){
        const command=this.commands[0]!;
        if(!command(this.view))break;
        this.commands.shift();
      }
    });
  }
  destroy(){this.destroyed=true;this.commands=[];}
});
export function completionNavigation(choices:KeybindingChoices={}){
  const commands:[KeybindingAction,Command][]=[['startCompletion',startCompletion],['acceptCompletion',acceptCompletion],['closeCompletion',closeCompletion]];
  const managed=new Set(commands.map(([,run])=>run));
  const bindings=[...completionKeymap.filter(binding=>!binding.run||!managed.has(binding.run)),
    ...commands.flatMap(([id,run])=>shortcutsFor(id,choices).map(key=>({key,run})))];
  return [pendingNavigation,Prec.highest(keymap.of(bindings.map(binding=>{
    const command=binding.run;
    if(!command||(command!==acceptCompletion&&!['ArrowDown','ArrowUp','PageDown','PageUp'].includes(binding.key??'')))return binding;
    return {...binding,run:(view:EditorView)=>{
      if(command(view))return true;
      if(completionStatus(view.state)!==null&&view.dom.querySelector('.cm-tooltip-autocomplete')){
        const plugin=view.plugin(pendingNavigation);
        if(plugin&&plugin.commands.length<100)plugin.commands.push(command);
        return true;
      }
      return false;
    }};
  })))];
}
