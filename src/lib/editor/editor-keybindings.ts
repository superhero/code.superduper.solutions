// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {keymap,type KeyBinding,type Command} from '@codemirror/view';
import {foldBoundaries,foldViewportFloor} from './fold-motion';
import {searchPanel,expandReplace} from './search-panel';
import {Prec} from '@codemirror/state';
import {defaultKeymap,indentMore,indentLess,indentSelection,selectAll,selectLineStart,toggleComment,toggleBlockComment,
  moveLineUp,moveLineDown,copyLineUp,copyLineDown,deleteLine,addCursorAbove,addCursorBelow} from '@codemirror/commands';
import {searchKeymap,openSearchPanel,findNext,findPrevious,gotoLine,selectNextOccurrence} from '@codemirror/search';
import {foldKeymap,foldCode,unfoldCode,foldAll,unfoldAll} from '@codemirror/language';
import {closeBracketsKeymap} from '@codemirror/autocomplete';
import {shortcutsFor,keybindingActions,shortcutIdentity,type KeybindingAction} from './keybindings';
import type {EditorSettings} from './settings';
const actions:Partial<Record<KeybindingAction,Command>>={
  find:openSearchPanel,replace:view=>{openSearchPanel(view);return expandReplace(view);},findNext,findPrevious,goToLine:gotoLine,selectAll,selectNext:selectNextOccurrence,
  selectLineStart: view=>{selectLineStart(view);return true;},toggleComment,toggleBlockComment,indent:indentMore,unindent:indentLess,
  indentSelection,moveLineUp,moveLineDown,copyLineUp,copyLineDown,deleteLine,addCursorAbove,addCursorBelow,
  fold:foldCode,unfold:unfoldCode,foldAll,unfoldAll
};
export function editorKeybindings(settings:EditorSettings,history?:{undo():void;redo():void},readOnly=false){
  const managed=new Set(Object.values(actions));
  const custom:KeyBinding[]=[];
  const readOnlyActions=new Set(['find','findNext','findPrevious','goToLine','selectAll','selectNext','selectLineStart','addCursorAbove','addCursorBelow','fold','unfold','foldAll','unfoldAll']);
  for(const [id,run] of Object.entries(actions))for(const key of shortcutsFor(id as KeybindingAction,settings.keybindings)){
    if(readOnly&&!readOnlyActions.has(id))continue;
    if((key==='Tab'||key==='Shift-Tab')&&settings.tabBehavior!=='indent')continue;
    custom.push({key,scope:["find","replace","findNext","findPrevious"].includes(id)?"editor search-panel":"editor",run:view=>{
      if((key==='Tab'||key==='Shift-Tab')&&settings.indentSize===0)return true;
      return run(view);
    },preventDefault:true});
  }
  if(history)for(const id of ['undo','redo'] as const)for(const key of shortcutsFor(id,settings.keybindings))
    custom.push({key,run:()=>{history[id]();return true;},preventDefault:true});
  if(!keybindingActions.some(action=>action.scope==='application'&&shortcutsFor(action.id,settings.keybindings).some(binding=>shortcutIdentity(binding)===shortcutIdentity('Mod-s'))))
    custom.push({key:'Mod-s',run:()=>true,preventDefault:true});
  // Prevent browser-native history input from resurrecting shortcuts the user removed.
  if(history)for(const key of ['Mod-z','Mod-Shift-z','Mod-y'])
    if(!keybindingActions.some(action=>shortcutsFor(action.id,settings.keybindings).some(binding=>shortcutIdentity(binding)===shortcutIdentity(key))))
      custom.push({key,run:()=>true,preventDefault:true});
  return [foldViewportFloor,foldBoundaries,searchPanel,Prec.highest(keymap.of(custom)),keymap.of([...defaultKeymap,...searchKeymap,...foldKeymap,
    ...(settings.closeBrackets?closeBracketsKeymap:[])].filter(binding=>(binding.scope&&!binding.scope.split(" ").includes("editor"))||!binding.run||!managed.has(binding.run)))];
}
