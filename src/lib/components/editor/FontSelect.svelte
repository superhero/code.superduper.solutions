<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import FontOption from './FontOption.svelte';
  import NavigationDropdown from '../NavigationDropdown.svelte';
  import {Button} from '../ui/button';
  import MaterialIcon from '../MaterialIcon.svelte';
  import {editorFonts,interfaceFonts,googleFont,isBundledEditorFont} from '$lib/editor/fonts';
  import {installFont,removeFont,isFontInstalled} from '$lib/editor/font-storage';
  let {value,kind="editor",disabled=false,onchange}:{value:string;kind?:"editor"|"interface";disabled?:boolean;onchange(value:string):void}=$props();
  let installed=$state(false),operation=$state<'install'|'delete'|null>(null),error=$state('');
  const pending=$derived(operation!==null);
  const bundled=$derived(isBundledEditorFont(value));
  const removing=$derived(operation==='delete'||operation===null&&installed);
  const label=$derived(kind==='editor'?'Editor font':'Interface font');
  const items=$derived([
    ...(kind==='editor'?[{value:'system',label:'System monospace',icon:'text_fields'},{value:'courier',label:'Courier New',icon:'text_fields'}]:[{value:'montserrat',label:'Montserrat',icon:'text_fields'},{value:'system',label:'System sans-serif',icon:'text_fields'},{value:'serif',label:'System serif',icon:'text_fields'},{value:'monospace',label:'System monospace',icon:'text_fields'}]),
    ...(kind==='editor'?editorFonts:interfaceFonts).filter(font=>kind==='editor'||!['Montserrat','Rationale'].includes(font.family)).map(font=>({value:`google:${font.family}`,label:font.family,icon:'text_fields'}))
  ]);
  $effect(()=>{
    const key=value;let cancelled=false,revision=0;installed=false;error='';
    const refresh=()=>{const current=++revision;if(googleFont(key))void isFontInstalled(key).then(result=>{if(!cancelled&&current===revision)installed=result;}).catch(()=>{});};
    refresh();
    window.addEventListener('code-editor-font-installed',refresh);
    window.addEventListener('code-editor-font-removed',refresh);
    return()=>{cancelled=true;window.removeEventListener('code-editor-font-installed',refresh);window.removeEventListener('code-editor-font-removed',refresh);};
  });
  async function changeInstallation(){
    const key=value,remove=installed;operation=remove?'delete':'install';error='';
    try{if(remove)await removeFont(key);else await installFont(key);if(value===key)installed=!remove;}
    catch(failure){if(value===key)error=failure instanceof Error?failure.message:`The font could not be ${remove?'deleted':'installed'}.`;}
    finally{operation=null;}
  }
</script>
<div class="font-control">
  <div class="font-choice"><NavigationDropdown id={kind==="editor"?"setting-fontFamily":"setting-interfaceFont"} {label} placeholder={label} searchable {value} {items} disabled={disabled||pending} matchTriggerWidth onchange={next=>onchange(next)}>{#snippet itemLabel(item)}<FontOption value={item.value} label={item.label} {kind} />{/snippet}</NavigationDropdown></div>
  {#if bundled}<span class="bundled-font" role="status" aria-label={`${label} is built in`}>Built in</span>
  {:else if googleFont(value)}<Button size="icon" tooltip={pending?removing?'Deleting…':'Installing…':removing?'Delete installed font':'Install'} disabled={disabled||pending} onclick={()=>void changeInstallation()} aria-label={removing?`Delete installed ${kind} font`:`Install ${kind} font for offline use`}><MaterialIcon name={pending?'progress_activity':removing?'delete':'install_desktop'} size={18}/></Button>{/if}
</div>
{#if error}<p class="font-error" role="alert">{error}</p>{/if}
<style>
  .font-control {display:flex;align-items:center;gap:6px;min-width:0;}
  .font-choice {flex:1;min-width:0;}
  .bundled-font {display:inline-flex;align-items:center;justify-content:center;min-height:2.25rem;padding:0 .75rem;font-size:.6875rem;font-weight:650;opacity:.6;white-space:nowrap;}
  .font-error {margin:6px 0 0;font-size:.6875rem;color:var(--color-foreground);}
</style>
