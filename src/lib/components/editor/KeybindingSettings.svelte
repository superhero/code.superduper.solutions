<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import {tick} from "svelte";
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import {Button} from '$lib/components/ui/button';
  import {keybindingActions,shortcutsFor,eventShortcut,shortcutConflict,shortcutLabel,type KeybindingAction,type KeybindingChoices} from '$lib/editor/keybindings';
  let {value,inherited={},repository=false,disabled=false,onchange}:{value:KeybindingChoices;inherited?:KeybindingChoices;repository?:boolean;disabled?:boolean;onchange(value:KeybindingChoices):void}=$props();
  let filter=$state(''),error=$state('');
  let recording=$state<{id:KeybindingAction;index:number}|null>(null);
  const effective=$derived({...inherited,...value});
  const matches=$derived(keybindingActions.filter(action=>`${action.label} ${shortcutsFor(action.id,effective).join(' ')}`.toLowerCase().includes(filter.toLowerCase())));
  export function reset() {
    if (disabled) return;
    onchange({}); error=''; recording=null;
  }
  function capture(event:KeyboardEvent,id:KeybindingAction,index:number){
    event.stopPropagation();event.preventDefault();
    if(disabled||event.repeat||event.isComposing||event.getModifierState('AltGraph'))return;
    if(event.key==='Escape'){recording=null;(event.currentTarget as HTMLInputElement).blur();return;}
    const shortcut=eventShortcut(event);if(!shortcut)return;
    const conflict=shortcutConflict(id,shortcut,effective);
    if(conflict){error=`${shortcutLabel([shortcut])} is already assigned to ${conflict}.`;return;}
    const keys=[...shortcutsFor(id,effective)];keys[index]=shortcut;
    onchange({...value,[id]:[...new Set(keys)]});error='';recording=null;
    (event.currentTarget as HTMLInputElement).blur();
  }
  function captureMouse(event:MouseEvent,id:KeybindingAction,index:number){
    if(event.button!==1||id!=='closeTab'||disabled)return;
    event.preventDefault();event.stopPropagation();
    const shortcut=eventShortcut({key:'MouseMiddle',ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,shiftKey:event.shiftKey});
    if(!shortcut)return;
    const keys=[...shortcutsFor(id,effective)];keys[index]=shortcut;
    onchange({...value,[id]:[...new Set(keys)]});error='';recording=null;
    (event.currentTarget as HTMLInputElement).blur();
  }
  function wheelBinding(node:HTMLInputElement,initial:{id:KeybindingAction;index:number}){
    let target=initial;
    const wheel=(event:WheelEvent)=>{
      const delta=event.deltaY||event.deltaX;
      if(disabled||document.activeElement!==node||!['zoomIn','zoomOut'].includes(target.id)||!delta)return;
      event.preventDefault();event.stopPropagation();
      const shortcut=eventShortcut({key:delta<0?'WheelUp':'WheelDown',ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,shiftKey:event.shiftKey});
      if(!shortcut)return;
      const conflict=shortcutConflict(target.id,shortcut,effective);
      if(conflict){error=`${shortcutLabel([shortcut])} is already assigned to ${conflict}.`;return;}
      const keys=[...shortcutsFor(target.id,effective)];keys[target.index]=shortcut;
      onchange({...value,[target.id]:[...new Set(keys)]});error='';recording=null;node.blur();
    };
    node.addEventListener('wheel',wheel,{passive:false});
    return {update(value:{id:KeybindingAction;index:number}){target=value;},destroy(){node.removeEventListener('wheel',wheel);}};
  }
  function remove(id:KeybindingAction,index:number){
    onchange({...value,[id]:shortcutsFor(id,effective).filter((_,i)=>i!==index)});recording=null;error='';
  }
</script>
<section class="keybinding-settings" aria-label="Keybindings">
  <div class="heading"><MaterialIcon name="keyboard" /><h2>Keybindings</h2></div>
  <input class="filter" type="search" aria-label="Filter keybindings" placeholder="Find an action or shortcut" bind:value={filter} {disabled}/>
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="bindings">
    {#each matches as action (action.id)}
      {@const keys=shortcutsFor(action.id,effective)}
      {@const canAdd=keys.length>0&&keys.length<8}
      <div class="binding-row">
        <div class="binding-header"><span class="action-label">{action.label}</span>
          {#if canAdd}<Button variant="ghost" size="icon-sm" aria-label={`Add ${action.label} shortcut`} tooltip="Add shortcut" {disabled} onclick={async()=>{recording={id:action.id,index:keys.length};await tick();document.getElementById(`binding-${action.id}-${keys.length}`)?.focus();}}><MaterialIcon name="add_box" size={18}/></Button>{/if}
        </div>
        <div class="shortcuts">
        <div class="shortcut-list">
        {#each Array.from({length:Math.max(1,keys.length+(recording?.id===action.id&&recording.index===keys.length?1:0))},(_,i)=>i) as index}
          <div class="shortcut"><input use:wheelBinding={{id:action.id,index}} id={`binding-${action.id}-${index}`} readonly aria-label={`${action.label} shortcut ${index+1}`} value={recording?.id===action.id&&recording.index===index?'':shortcutLabel(keys[index]?[keys[index]!]:[])} placeholder={recording?.id===action.id&&recording.index===index?'Press shortcut…':'Unassigned'} {disabled}
            onfocus={()=>{recording={id:action.id,index};error='';}} onblur={()=>{if(recording?.id===action.id&&recording.index===index)recording=null;}} onkeydown={event=>capture(event,action.id,index)} onmousedown={event=>{if(event.button===1&&action.id==='closeTab')event.preventDefault();}} onauxclick={event=>captureMouse(event,action.id,index)}/>
            {#if keys[index]}<Button variant="ghost" size="icon-sm" aria-label={`Remove ${action.label} shortcut ${index+1}`} tooltip="Remove shortcut" {disabled} onclick={()=>remove(action.id,index)}><MaterialIcon name="delete_forever" size={18}/></Button>{/if}
          </div>
        {/each}
        </div>
      </div></div>
    {/each}
  </div>
  {#if !matches.length}<p>No matching actions.</p>{/if}
</section>
<style>
  .keybinding-settings { margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-surface);border-radius:4px;min-width:0; }
  .heading {display:flex;gap:12px;align-items:center;margin-bottom:var(--pane-padding);}.heading h2 {margin:0;font-size:.9375rem;font-weight:650;flex:1;}
  input {border:0;outline:none;border-radius:4px;background:var(--color-background);color:var(--color-foreground);font:inherit;font-size:.6875rem;padding:0 11px;width:100%;min-width:0;}
  input:focus {background:var(--color-focus-background);color:var(--color-focus-foreground);}
  .filter {margin-bottom:16px;}.binding-row {display:grid;grid-template-columns:minmax(0,1fr);gap:0;margin-top:var(--pane-gap);min-width:0;border-radius:4px;background:var(--color-background);overflow:hidden;}
  .binding-header {display:flex;align-items:center;min-width:0;background:var(--palette-8);}
  .action-label {display:flex;flex:1;align-items:center;min-width:0;min-height:36px;box-sizing:border-box;padding:8px 11px;color:var(--color-background);font-size:.6875rem;line-height:20px;font-weight:650;overflow-wrap:anywhere;}
  .shortcuts {display:grid;grid-template-columns:minmax(0,1fr);gap:0;align-items:start;min-width:0;}
  .shortcut-list {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:0;min-width:0;}
  .shortcut {display:flex;gap:0;min-width:0;}.shortcut input {border-radius:0;font-family:inherit;}
  .binding-row :global(button[data-slot="button"]) {border-radius:0;border-inline-start:1px solid var(--color-background);}
  .shortcut:not(:last-child) :global(button[data-slot="button"]) {border-inline-end:2px solid var(--color-surface);}
  p {font-size:.6875rem;line-height:1.5;}p[role="alert"] {color:var(--color-foreground);}
</style>
