<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import { languageForPath, mappedLanguageForPath, type LanguageMappings } from '$lib/editor/languages';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import { engines, engineLanguages, engineFor, intelligenceLanguage, type EngineChoices } from '$lib/intelligence/catalog';
  import { languagePackages, installedPackages, subscribeLanguagePackages, installLanguageEngine, removeLanguageEngine } from '$lib/intelligence/registry';
  let {value,inherited={},repository=false,files,mappings={},disabled=false,oninstalled,onchange}: {files?:readonly string[] | undefined;mappings?:LanguageMappings;value:EngineChoices;inherited?:EngineChoices;repository?:boolean;disabled?:boolean;oninstalled?(id:string):void;onchange(value:EngineChoices):void}=$props();
  let query=$state(''),pending=$state('');
  let controller:AbortController | undefined;
  let disposed=false;
  const effective=$derived({...inherited,...value});
  let installed=$state<{id:string;sha256:string}[]>([]), error=$state('');
  const ready=(id:string)=>installed.some(record=>record.id===id&&languagePackages.some(item=>item.id===id&&item.sha256===record.sha256));
  onMount(()=>{
    disposed=false;
    const refresh=async()=>{try{const records=await installedPackages();if(!disposed)installed=records;}catch(failure){if(!disposed)error=String(failure);}};
    const unsubscribe=subscribeLanguagePackages(()=>void refresh());void refresh();return()=>{disposed=true;controller?.abort();unsubscribe();};
  });
  async function install(id:string) {
    const item=languagePackages.find(item=>item.id===id);
    if(!item || disabled || pending)return;
    pending=id;error='';controller=new AbortController();
    try {
      await installLanguageEngine(item,()=>{},controller.signal);
      if(!disposed){installed=await installedPackages();oninstalled?.(id);}
    } catch(failure){if(!disposed && !controller.signal.aborted)error=failure instanceof Error?failure.message:String(failure);}
    finally {if(!disposed)pending='';controller=undefined;}
  }
  async function uninstall(id:string) {
    if(disabled || pending)return;
    pending=id;error='';
    try {await removeLanguageEngine(id);if(!disposed)installed=await installedPackages();}
    catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';}
  }
  function choose(language:string,id:string){const next={...value};if(id==='inherit')delete next[language];else next[language]=id;onchange(next);}
  const labels:Record<string,string>={liquid:'Shopify Liquid',sql:'PostgreSQL SQL',toml:'TOML',wgsl:'WGSL',dockerfile:'Dockerfile / Containerfile',javascript:'JavaScript / JSX',typescript:'TypeScript / TSX',html:'HTML',css:'CSS',scss:'SCSS',less:'Less',json:'JSON',jsonc:'JSONC',yaml:'YAML',markdown:'Markdown',graphql:'GraphQL'};
  const relevant=$derived(new Set((files ?? ['example.js','example.ts','example.html','example.css','example.json']).map(path=>intelligenceLanguage(path,mappedLanguageForPath(path,mappings)??'auto',languageForPath(path,'auto',mappings)))));
  const rows=$derived([...engineLanguages].sort((a,b)=>Number(relevant.has(b))-Number(relevant.has(a)) || (labels[a]??a).localeCompare(labels[b]??b,'en')).filter(language=>(labels[language]??language).toLowerCase().includes(query.trim().toLowerCase())));

</script>
<section aria-label="Language engines" class="engine-preferences">
  <div class="card-heading"><MaterialIcon name="precision_manufacturing" /><div><h2>Language engines</h2></div></div>
  {#if error}<p role="alert">{error}</p>{/if}
  <input class="engine-search" aria-label="Filter language engines" placeholder="Filter languages" bind:value={query} />
  <div class="engine-list">{#each rows as language}
    {@const selected=engineFor(language,effective)}
    {@const available=engines.filter(engine=>(engine.languages as readonly string[]).includes(language))}
    {@const item=languagePackages.find(item=>item.id===available[0]?.id)}
    {@const current=installed.find(record=>record.id===item?.id)}
    <div class="engine-choice" data-language-engine={item?.id}><span class="engine-label">{labels[language]??language}</span>
      <div class="engine-controls"><div class="engine-select"><NavigationDropdown matchTriggerWidth label={`${labels[language]??language} language engine`} value={repository && !Object.hasOwn(value,language)?'inherit':selected??'none'} placeholder="Disabled" disabled={disabled || Boolean(pending)}
        items={[...(repository?[{value:'inherit',label:`Inherited · ${engines.find(engine=>engine.id===engineFor(language,inherited))?.name??'Disabled'}`,icon:'public'}]:[]),...available.map(engine=>({value:engine.id,label:`${engine.name}${ready(engine.id)?'':' · Not installed'}`,icon:'code'})),{value:'none',label:'Disabled',icon:'block'}]}
        onchange={id=>choose(language,id)} /></div>
      {#if item}
        {#if !ready(item.id) && (selected || current)}<Button variant="ghost" size="icon" tooltip={pending===item.id?'Installing…':current?'Update':'Install'} disabled={disabled || Boolean(pending)} aria-label={`${current?'Update':'Install'} ${item.name} language engine`} onclick={()=>install(item.id)}><MaterialIcon name={current?'downloading':'install_desktop'} size={18}/></Button>{/if}
        {#if current}<Button variant="ghost" size="icon" tooltip="Uninstall" aria-label={`Uninstall ${item.name} language engine`} disabled={disabled || Boolean(pending)} onclick={()=>uninstall(item.id)}><MaterialIcon name="delete" size={18} /></Button>{/if}
      {/if}
      </div>

    </div>
  {/each}
  {#if !rows.length}<p>No matching languages.</p>{/if}
  </div>

</section>
<style>
  .engine-preferences{margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-surface);border-radius:4px}
  h2{margin:0;font-size:0.9375rem;font-weight:650}p{font-size:0.75rem;line-height:1.6;margin:6px 0 18px}
  .card-heading{display:flex;gap:12px;margin-bottom:var(--pane-padding);align-items:center}
  
  .engine-search{width:100%;background:var(--color-background);color:var(--color-foreground);border:0;border-radius:4px;padding:8px 11px;font-size:0.6875rem}
  .engine-list{margin-top:6px}
  .engine-choice{display:grid;grid-template-columns:minmax(100px,140px) minmax(0,1fr);gap:0;align-items:start;margin-bottom:6px;font-size:0.6875rem;min-width:0}
  .engine-controls{display:flex;align-items:center;gap:0;min-width:0;border-radius:0 4px 4px 0;background:var(--color-background);overflow:hidden}.engine-select{flex:1;min-width:0}
  .engine-label{display:flex;align-items:center;justify-content:flex-end;text-align:right;box-sizing:border-box;height:36px;min-height:36px;padding:1px 8px;border-block:1px solid var(--color-background);border-radius:4px 0 0 4px;background:var(--palette-8);color:var(--color-background);line-height:1.25;font-weight:650;overflow-wrap:anywhere}
  .engine-controls :global(button.navigation-trigger){border-block:1px solid var(--color-background);border-radius:0}
  .engine-controls :global(button[data-slot="button"]){border-block:1px solid var(--color-background);border-inline-start:1px solid var(--color-background);border-radius:0}
  @container settings-pane (max-width:550px){
    .engine-choice{grid-template-columns:minmax(0,1fr)}
    .engine-label{justify-content:flex-start;text-align:left;border-radius:4px 4px 0 0}
    .engine-controls{border-radius:0 0 4px 4px}
  }
</style>
