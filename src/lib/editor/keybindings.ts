// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export type KeybindingChoices=Record<string,string[]>;
export const keybindingActions=[
  {id:'undo',label:'Undo',scope:'application',keys:['Mod-z']},
  {id:'redo',label:'Redo',scope:'application',keys:['Mod-Shift-z','Mod-y']},
  {id:'zoomIn',label:'Zoom in',scope:'application',keys:['Shift-WheelUp']},
  {id:'zoomOut',label:'Zoom out',scope:'application',keys:['Shift-WheelDown']},
  {id:'resetZoom',label:'Reset zoom',scope:'application',keys:['Mod-0']},
  {id:'format',label:'Format file',scope:'application',keys:[]},
  {id:'diff',label:'File diff',scope:'application',keys:[]},
  {id:'commit',label:'Commit changes',scope:'application',keys:[]},
  {id:'git',label:'Git operations',scope:'application',keys:[]},
  {id:'closeTab',label:'Close tab',scope:'application',keys:['MouseMiddle']},
  {id:'splitTab',label:'Split editor',scope:'application',keys:[]},
  {id:'nextTab',label:'Next tab',scope:'application',keys:[]},
  {id:'previousTab',label:'Previous tab',scope:'application',keys:[]},
  {id:'openEditor',label:'Open editor',scope:'application',keys:[]},
  {id:'openHistory',label:'Open history',scope:'application',keys:[]},
  {id:'openSettings',label:'Open settings',scope:'application',keys:[]},
  {id:'startCompletion',label:'Show completions',scope:'editor',keys:['Ctrl-Space'],macKeys:['Ctrl-Space','Alt-`','Alt-i']},
  {id:'acceptCompletion',label:'Accept completion',scope:'completion',keys:['Enter']},
  {id:'closeCompletion',label:'Dismiss completion',scope:'completion',keys:['Escape']},
  {id:'find',label:'Find',scope:'editor',keys:['Mod-f']},
  {id:'replace',label:'Replace',scope:'editor',keys:['Mod-Alt-f']},
  {id:'findNext',label:'Find next',scope:'editor',keys:['F3','Mod-g']},
  {id:'findPrevious',label:'Find previous',scope:'editor',keys:['Shift-F3','Mod-Shift-g']},
  {id:'goToLine',label:'Go to line',scope:'editor',keys:['Mod-Alt-g']},
  {id:'selectAll',label:'Select all',scope:'editor',keys:['Mod-a']},
  {id:'selectNext',label:'Select next occurrence',scope:'editor',keys:['Mod-d']},
  {id:'selectLineStart',label:'Select to line start',scope:'editor',keys:['Alt-Shift-ArrowLeft']},
  {id:'toggleComment',label:'Toggle line comment',scope:'editor',keys:['Mod-/']},
  {id:'toggleBlockComment',label:'Toggle block comment',scope:'editor',keys:['Alt-a'],macKeys:['Ctrl-a']},
  {id:'indent',label:'Indent',scope:'editor',keys:['Tab','Mod-]']},
  {id:'unindent',label:'Unindent',scope:'editor',keys:['Shift-Tab','Mod-[']},
  {id:'indentSelection',label:'Reindent selection',scope:'editor',keys:['Mod-Alt-\\']},
  {id:'moveLineUp',label:'Move line up',scope:'editor',keys:['Alt-ArrowUp']},
  {id:'moveLineDown',label:'Move line down',scope:'editor',keys:['Alt-ArrowDown']},
  {id:'copyLineUp',label:'Copy line up',scope:'editor',keys:['Alt-Shift-ArrowUp']},
  {id:'copyLineDown',label:'Copy line down',scope:'editor',keys:['Alt-Shift-ArrowDown']},
  {id:'deleteLine',label:'Delete line',scope:'editor',keys:['Mod-Shift-k']},
  {id:'addCursorAbove',label:'Add cursor above',scope:'editor',keys:['Mod-Alt-ArrowUp']},
  {id:'addCursorBelow',label:'Add cursor below',scope:'editor',keys:['Mod-Alt-ArrowDown']},
  {id:'fold',label:'Fold code',scope:'editor',keys:['Ctrl-Shift-['],macKeys:['Meta-Alt-[']},
  {id:'unfold',label:'Unfold code',scope:'editor',keys:['Ctrl-Shift-]'],macKeys:['Meta-Alt-]']},
  {id:'foldAll',label:'Fold all',scope:'editor',keys:['Ctrl-Alt-[']},
  {id:'unfoldAll',label:'Unfold all',scope:'editor',keys:['Ctrl-Alt-]']},
] as const;
export type KeybindingAction=typeof keybindingActions[number]['id'];
export const isMac=()=>typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform);
export function normalizeShortcut(value:string):string|null{
  if(!value||value.length>80)return null;
  const parts=value.split('-');let key=parts.pop()!;
  if(!key&&parts.at(-1)===''){parts.pop();key='-';}
  if(!key||parts.some(part=>!['Mod','Ctrl','Meta','Alt','Shift'].includes(part))||new Set(parts).size!==parts.length)return null;
  if(!(/^[^\u0000-\u0020\u007f]$/u.test(key)||/^(?:F(?:[1-9]|1[0-9]|2[0-4])|Arrow(?:Left|Right|Up|Down)|Enter|Escape|Tab|Space|Backspace|Delete|Home|End|PageUp|PageDown|Insert|MouseMiddle|WheelUp|WheelDown)$/.test(key)))return null;
  if(key.length===1)key=key.toLowerCase();
  const modifiers=['Mod','Ctrl','Meta','Alt','Shift'].filter(part=>parts.includes(part));
  return [...modifiers,key].join('-');
}
export function normalizeKeybindings(value:unknown):KeybindingChoices{
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const result:KeybindingChoices={};
  for(const action of keybindingActions){
    const keys=(value as Record<string,unknown>)[action.id];
    if(!Array.isArray(keys)||keys.length>8)continue;
    if(keys.every(key=>typeof key==='string'&&normalizeShortcut(key)&&(!key.includes('MouseMiddle')||action.id==='closeTab')&&(!/Wheel(?:Up|Down)/.test(key)||action.id==='zoomIn'||action.id==='zoomOut')))result[action.id]=[...new Set(keys.map(key=>normalizeShortcut(key)!))];
  }
  return result;
}
export function shortcutsFor(id:KeybindingAction,choices:KeybindingChoices,mac=isMac()):readonly string[]{
  const action=keybindingActions.find(action=>action.id===id)!;
  return choices[id]??(mac&&'macKeys' in action?action.macKeys:action.keys);
}
export function eventShortcut(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'>,mac=isMac()):string|null{
  if(['Control','Meta','Alt','Shift','AltGraph','Dead','Process','Unidentified'].includes(event.key))return null;
  return normalizeShortcut([...(event.ctrlKey?[mac?'Ctrl':'Mod']:[]),...(event.metaKey?[mac?'Mod':'Meta']:[]),
    ...(event.altKey?['Alt']:[]),...(event.shiftKey?['Shift']:[]),event.key===' '?'Space':event.key].join('-'));
}
export function shortcutIdentity(key:string,mac=isMac()):string{
  return normalizeShortcut(key.replace(/\bMod-/g,mac?'Meta-':'Ctrl-'))??key;
}
export function matchesShortcut(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'>,key:string,mac=isMac()):boolean{
  const actual=eventShortcut(event,mac);return actual!==null&&shortcutIdentity(actual,mac)===shortcutIdentity(key,mac);
}
export function shortcutConflict(id:KeybindingAction,key:string,choices:KeybindingChoices,mac=isMac()):string|null{
  const desired=shortcutIdentity(key,mac);
  const scope=keybindingActions.find(action=>action.id===id)!.scope;
  return keybindingActions.find(action=>action.id!==id&&((action.scope==='completion')===(scope==='completion'))&&shortcutsFor(action.id,choices,mac).some(binding=>shortcutIdentity(binding,mac)===desired))?.label??null;
}
export const shortcutLabel=(keys:readonly string[])=>keys.map(key=>{
  const parts=key==='-'?['−']:key.endsWith('--')?[...key.slice(0,-2).split('-'),'−']:key.split('-');
  return parts.map(part=>part==='WheelUp'?'Wheel up':part==='WheelDown'?'Wheel down':part==='MouseMiddle'?'Middle click':part==='Mod'?(isMac()?'⌘':'Ctrl'):part.length===1?part.toUpperCase():part).join(' + ');
}).join(', ');

/** Mouse bindings apply to the tab under the pointer, including inactive tabs. */
export function middleClickClosesTab(settings:{keybindings:KeybindingChoices;middleClickClosesTabs:boolean},event:Pick<MouseEvent,'button'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'>):boolean{
  if(event.button!==1)return false;
  if(!Object.hasOwn(settings.keybindings,'closeTab')&&!settings.middleClickClosesTabs)return false;
  return shortcutsFor('closeTab',settings.keybindings).some(key=>matchesShortcut({...event,key:'MouseMiddle'},key));
}
