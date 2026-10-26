<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import { Button } from '$lib/components/ui/button';
  import { LANGUAGE_OPTIONS, languageForPath, type LanguageMappings } from '$lib/editor/languages';
  import { syntaxRegistry } from '$lib/syntax/registry';
  import { optionalSyntax, type SyntaxChoices } from '$lib/syntax/catalog';
  let {value,inherited={},repository=false,files,mappings={},disabled=false,oninstalled,onchange}: {
    files?:readonly string[] | undefined;mappings?:LanguageMappings;value:SyntaxChoices;inherited?:SyntaxChoices;repository?:boolean;disabled?:boolean;oninstalled?(id:string):void;onchange(value:SyntaxChoices):void;
  }=$props();
  let query=$state(''),limit=$state(5);
  const effective=$derived({...inherited,...value});
  const supported=$derived(LANGUAGE_OPTIONS.filter(item=>!['auto','text'].includes(item.id)).map(item=>({...item,label:item.label.replace(' · Optional package','')})).sort((a,b)=>a.label.localeCompare(b.label,'en')));
  const relevant=$derived(new Set((files ?? ['example.js','example.ts','example.html','example.css','example.json','example.xml','example.md','example.yaml']).map(path=>languageForPath(path,'auto',mappings))));
  const initial=$derived(supported.filter(item=>relevant.has(item.id)));
  const additional=$derived(supported.filter(item=>!relevant.has(item.id)));
  const rows=$derived([...initial,...additional].filter(item=>item.label.toLowerCase().includes(query.trim().toLowerCase())));
  const enabled=(id:string)=>effective[id] ?? !optionalSyntax.some(item=>item.id===id);
  function selection(id:string){if(repository && !Object.hasOwn(value,id) && !(id==='handlebars' && Object.hasOwn(value,'handlebars-beta')))return 'inherit';return !enabled(id)?'disabled':id==='handlebars'?(effective['handlebars-beta']?'beta':'stable'):'enabled';}
  function options(id:string){return [
    ...(repository?[{value:'inherit',label:`Inherited · ${(inherited[id] ?? !optionalSyntax.some(item=>item.id===id))?'Enabled':'Disabled'}`,icon:'person'}]:[]),
    ...(id==='handlebars'?[{value:'stable',label:'Xiechao Handlebars',icon:'code'},{value:'beta',label:ready('handlebars-beta')?'Gentrace beta':'Gentrace beta · Not installed',icon:'experiment'}]:[{value:'enabled',label:`${syntaxRegistry.catalog.find(item=>item.id===id)?.name ?? LANGUAGE_OPTIONS.find(item=>item.id===id)?.label ?? id}${optionalSyntax.some(item=>item.id===id) && !ready(id)?' · Not installed':''}`,icon:'code'}]),
    {value:'disabled',label:'Disabled',icon:'block'}];}
  let pending=$state('');
  let disposed=false,controller:AbortController | undefined;
  let installed=$state<{id:string;sha256:string}[]>([]),error=$state('');
  const ready=(id:string)=>installed.some(record=>record.id===id&&syntaxRegistry.catalog.some(item=>item.id===id&&item.sha256===record.sha256));
  onMount(()=>{
    disposed=false;
    const refresh=async()=>{try{const records=await syntaxRegistry.installedPackages();if(!disposed)installed=records;}catch(failure){if(!disposed)error=String(failure);}};
    const unsubscribe=syntaxRegistry.subscribe(()=>void refresh());void refresh();return()=>{disposed=true;controller?.abort();unsubscribe();};
  });
  async function install(id:string){
    const item=syntaxRegistry.catalog.find(item=>item.id===id);
    if(!item || disabled || pending)return;
    pending=id;error='';controller=new AbortController();
    try{await syntaxRegistry.installPackage(item,()=>{},controller.signal);if(!disposed){installed=await syntaxRegistry.installedPackages();oninstalled?.(id);}}
    catch(failure){if(!disposed && !controller.signal.aborted)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';controller=undefined;}
  }
  async function uninstall(id:string){
    if(disabled || pending)return;
    pending=id;error='';
    try{await syntaxRegistry.removePackage(id);if(!disposed)installed=await syntaxRegistry.installedPackages();}
    catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';}
  }
  function choose(id:string,choice:string){const next={...value};if(choice==='inherit'){delete next[id];if(id==='handlebars')delete next['handlebars-beta'];}else{next[id]=choice!=='disabled';if(id==='handlebars' && choice!=='disabled')next['handlebars-beta']=choice==='beta';}onchange(next);}
</script>
<section aria-label="Syntax highlighting" class="syntax-preferences">
  <div class="card-heading"><MaterialIcon name="format_ink_highlighter" /><div><h2>Syntax highlighting</h2></div></div>
  {#if error}<p role="alert">{error}</p>{/if}
  <input class="syntax-search" aria-label="Filter syntax highlighting" placeholder="Filter languages" bind:value={query} oninput={()=>limit=query.trim()?20:5} />
  <div class="syntax-list">
    {#each rows.slice(0,limit) as item (item.id)}
      {@const artifact=syntaxRegistry.catalog.find(artifact=>artifact.id===(item.id==='handlebars'?'handlebars-beta':item.id))}
      {@const current=installed.find(record=>record.id===artifact?.id)}
      {@const needsPackage=enabled(item.id) && (item.id!=='handlebars' || Boolean(effective['handlebars-beta']))}
      <div class="syntax-choice"><span class="syntax-label">{item.label}</span>
        <div class="syntax-controls"><div class="syntax-select"><NavigationDropdown matchTriggerWidth placeholder="Select syntax" label={item.id==='handlebars'?'Handlebars syntax provider':`${item.label} syntax highlighting`} value={selection(item.id)} items={options(item.id)} disabled={disabled || Boolean(pending)} onchange={choice=>choose(item.id,choice)} /></div>
        {#if artifact}
          {#if !ready(artifact.id) && (needsPackage || current)}<Button variant="ghost" size="icon" tooltip={pending===artifact.id?'Installing…':current?'Update':'Install'} disabled={disabled || Boolean(pending)} aria-label={`${current?'Update':'Install'} ${artifact.name} syntax package`} onclick={()=>install(artifact.id)}><MaterialIcon name={current?'downloading':'install_desktop'} size={18}/></Button>{/if}
          {#if current}<Button variant="ghost" size="icon" tooltip="Uninstall" aria-label={`Uninstall ${artifact.name} syntax package`} disabled={disabled || Boolean(pending)} onclick={()=>uninstall(artifact.id)}><MaterialIcon name="delete" size={18} /></Button>{/if}
        {/if}
        </div>
      </div>
    {/each}
    {#if !rows.length}<p>No matching languages.</p>{/if}
    {#if rows.length>limit}<Button class="show-more" variant="ghost" onclick={()=>limit+=20}><MaterialIcon name="visibility" size={18}/>Show {Math.min(20,rows.length-limit)} more of {rows.length-limit}</Button>
    {/if}
  </div>
</section>

<style>
  .syntax-preferences{margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-surface);border-radius:4px}
  .card-heading{display:flex;gap:12px;margin-bottom:var(--pane-padding);align-items:center}
  
  h2{margin:0;font-size:0.9375rem;font-weight:650}p{font-size:0.75rem;line-height:1.6;margin:6px 0 18px}
  .syntax-search{width:100%;background:var(--color-background);color:var(--color-foreground);border:0;border-radius:4px;padding:8px 11px;font-size:0.6875rem}
  .syntax-list{margin-top:6px}
  .syntax-choice{display:grid;grid-template-columns:minmax(100px,140px) minmax(0,1fr);gap:0;align-items:start;margin-bottom:6px;font-size:0.6875rem;min-width:0}
  .syntax-controls{display:flex;align-items:center;gap:0;min-width:0;border-radius:0 4px 4px 0;background:var(--color-background);overflow:hidden}.syntax-select{flex:1;min-width:0}
  .syntax-label{display:flex;align-items:center;justify-content:flex-end;text-align:right;box-sizing:border-box;height:36px;min-height:36px;padding:1px 8px;border-block:1px solid var(--color-background);border-radius:4px 0 0 4px;background:var(--palette-8);color:var(--color-background);line-height:1.25;font-weight:650;overflow-wrap:anywhere}
  .syntax-controls :global(button.navigation-trigger){border-block:1px solid var(--color-background);border-radius:0}
  .syntax-controls :global(button[data-slot="button"]){border-block:1px solid var(--color-background);border-inline-start:1px solid var(--color-background);border-radius:0}
  .syntax-list :global(.show-more){width:100%}
  @container settings-pane (max-width:550px){
    .syntax-choice{grid-template-columns:minmax(0,1fr)}
    .syntax-label{justify-content:flex-start;text-align:left;border-radius:4px 4px 0 0}
    .syntax-controls{border-radius:0 0 4px 4px}
  }
</style>
