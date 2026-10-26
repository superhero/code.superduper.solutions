<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import FontOption from './FontOption.svelte';
  import NavigationDropdown from '../NavigationDropdown.svelte';
  import {Button} from '../ui/button';
  import MaterialIcon from '../MaterialIcon.svelte';
  import {editorFonts,interfaceFonts,googleFont} from '$lib/editor/fonts';
  import {installFont,isFontInstalled} from '$lib/editor/font-storage';
  let {value,kind="editor",disabled=false,onchange}:{value:string;kind?:"editor"|"interface";disabled?:boolean;onchange(value:string):void}=$props();
  let installed=$state(false),pending=$state(false),error=$state('');
  const label=$derived(kind==='editor'?'Editor font':'Interface font');
  const items=$derived([
    ...(kind==='editor'?[{value:'system',label:'System monospace',icon:'text_fields'},{value:'courier',label:'Courier New',icon:'text_fields'}]:[{value:'montserrat',label:'Montserrat',icon:'text_fields'},{value:'system',label:'System sans-serif',icon:'text_fields'},{value:'serif',label:'System serif',icon:'text_fields'},{value:'monospace',label:'System monospace',icon:'text_fields'}]),
    ...(kind==='editor'?editorFonts:interfaceFonts).filter(font=>kind==='editor'||!['Montserrat','Rationale'].includes(font.family)).map(font=>({value:`google:${font.family}`,label:font.family,icon:'text_fields'}))
  ]);
  $effect(()=>{
    const key=value;let cancelled=false;installed=false;error='';
    if(googleFont(key))void isFontInstalled(key).then(result=>{if(!cancelled)installed=result;}).catch(()=>{});
    return()=>{cancelled=true;};
  });
  async function install(){
    const key=value;pending=true;error='';
    try{await installFont(key);if(value===key)installed=true;}
    catch(failure){error=failure instanceof Error?failure.message:'The font could not be installed.';}
    finally{pending=false;}
  }
</script>
<div class="font-control">
  <div class="font-choice"><NavigationDropdown id={kind==="editor"?"setting-fontFamily":"setting-interfaceFont"} {label} placeholder={label} searchable {value} {items} {disabled} matchTriggerWidth onchange={next=>onchange(next)}>{#snippet itemLabel(item)}<FontOption value={item.value} label={item.label} {kind} />{/snippet}</NavigationDropdown></div>
  {#if googleFont(value)}<Button size={installed?'default':'icon'} tooltip={pending?'Installing…':installed?'Installed':'Install'} disabled={disabled || pending || installed} onclick={()=>void install()} aria-label={`Install ${kind} font for offline use`}>{#if installed}Installed{:else}<MaterialIcon name={pending?'downloading':'install_desktop'} size={18}/>{/if}</Button>{/if}
</div>
{#if error}<p class="font-error" role="alert">{error}</p>{/if}
<style>
  .font-control {display:flex;align-items:center;gap:6px;min-width:0;}
  .font-choice {flex:1;min-width:0;}
  .font-error {margin:6px 0 0;font-size:.6875rem;color:var(--color-foreground);}
</style>
