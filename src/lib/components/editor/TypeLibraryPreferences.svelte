<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import {onMount} from 'svelte';
  import {Button} from '$lib/components/ui/button';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import {languagePackages,installedPackages,subscribeLanguagePackages} from '$lib/intelligence/registry';
  import {typeLibraries,type TypeLibraryChoices} from '$lib/intelligence/type-libraries';
  import {typeRegistry} from '$lib/intelligence/type-registry';
  import {packageSize,type FormatterPackage} from '$lib/formatting/packages';
  import NpmTypePreferences from './NpmTypePreferences.svelte';

  let {value,inherited={},repository=false,disabled=false,onchange}:{value:TypeLibraryChoices;inherited?:TypeLibraryChoices;repository?:boolean;disabled?:boolean;onchange(value:TypeLibraryChoices):void}=$props();
  let engineInstalled=$state(false),installed=$state<{id:string;sha256:string}[]>([]),pending=$state(''),error=$state('');
  let fileInput=$state<HTMLInputElement>();
  let controller:AbortController|undefined,disposed=false,revision=0;
  const effective=$derived({...inherited,...value});
  const ready=(item:FormatterPackage)=>installed.some(record=>record.id===item.id&&record.sha256===item.sha256);
  async function refresh(){
    const current=++revision;
    try{
      const engines=await installedPackages(),engine=languagePackages.find(item=>item.id==='typescript');
      const available=engines.some(record=>record.id===engine?.id&&record.sha256===engine.sha256);
      const records=available?await typeRegistry.installedPackages():[];
      if(!disposed&&current===revision){engineInstalled=available;installed=records;}
    }catch(failure){if(!disposed&&current===revision)error=failure instanceof Error?failure.message:String(failure);}
  }
  onMount(()=>{
    disposed=false;void refresh();
    const unsubscribeEngine=subscribeLanguagePackages(()=>void refresh()),unsubscribeTypes=typeRegistry.subscribe(()=>void refresh());
    return()=>{disposed=true;revision++;controller?.abort();unsubscribeEngine();unsubscribeTypes();};
  });
  function choose(id:keyof TypeLibraryChoices,selection:string){
    const next={...value};if(selection==='inherit')delete next[id];else next[id]=selection==='enabled';onchange(next);
  }
  async function install(item:FormatterPackage){
    if(disabled||pending||!engineInstalled)return;
    pending=item.id;error='';const activeController=new AbortController();controller=activeController;
    try{
      await typeRegistry.installPackage(item,()=>{},activeController.signal);
      if(!disposed){await refresh();choose(item.id as keyof TypeLibraryChoices,'enabled');}
    }catch(failure){if(!disposed&&!activeController.signal.aborted)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';controller=undefined;}
  }
  async function uninstall(id:string){
    if(disabled||pending)return;pending=id;error='';
    try{await typeRegistry.removePackage(id);if(!disposed)await refresh();}
    catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';}
  }
  async function importFile(file:File|undefined){
    if(!file||disabled||pending||!engineInstalled)return;pending='import';error='';
    try{await typeRegistry.importPackage(await file.arrayBuffer());if(!disposed)await refresh();}
    catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';if(fileInput)fileInput.value='';}
  }
  async function exportFile(item:FormatterPackage){
    if(disabled||pending)return;pending=item.id;error='';
    try{
      const {bytes}=await typeRegistry.readPackage(item);if(disposed)return;
      const url=URL.createObjectURL(new Blob([bytes],{type:'application/json'})),link=document.createElement('a');
      link.href=url;link.download=item.url.split('/').at(-1)!;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';}
  }
</script>

{#if engineInstalled}
  <section class="type-preferences" aria-label="Type libraries">
    <div class="card-heading"><MaterialIcon name="library_books" /><h2>Type libraries</h2></div>
    <p>JavaScript’s built-in types come with the TypeScript engine. Install additional libraries for the environments you use.</p>
    {#if error}<p role="alert">{error}</p>{/if}
    <div class="type-list">{#each typeLibraries as library}
      {@const item=typeRegistry.catalog.find(item=>item.id===library.id)!}
      {@const current=installed.some(record=>record.id===item.id)}
      <div class="type-choice" data-type-library={library.id}>
        <div class="type-description"><h3>{library.name}</h3><p>{library.description}</p><span class="package-detail">{item.version} · {packageSize(item.bytes)}{current&&!ready(item)?' · Update available':!current?' · Not installed':''}</span></div>
        <div class="type-controls">
          <div class="type-select"><NavigationDropdown matchTriggerWidth placeholder="Disabled" label={`${library.name} types`} value={repository&&!Object.hasOwn(value,library.id)?'inherit':effective[library.id]?'enabled':'disabled'} disabled={disabled||Boolean(pending)}
            items={[...(repository?[{value:'inherit',label:`Inherited · ${inherited[library.id]?'Enabled':'Disabled'}`,icon:'public'}]:[]),{value:'enabled',label:'Enabled',icon:'check'},{value:'disabled',label:'Disabled',icon:'block'}]}
            onchange={selection=>choose(library.id,selection)} /></div>
          {#if !ready(item)}<Button variant="ghost" size="icon" tooltip={pending===item.id?'Installing…':current?'Update':'Install'} disabled={disabled||Boolean(pending)} aria-label={`${current?'Update':'Install'} ${library.name} types`} onclick={()=>install(item)}><MaterialIcon name={current?'downloading':'install_desktop'} size={18}/></Button>{/if}
          {#if ready(item)}<Button variant="ghost" size="icon" tooltip="Export package" aria-label={`Export ${library.name} types`} disabled={disabled||Boolean(pending)} onclick={()=>exportFile(item)}><MaterialIcon name="download" size={18} /></Button>{/if}
          {#if current}<Button variant="ghost" size="icon" tooltip="Uninstall" aria-label={`Uninstall ${library.name} types`} disabled={disabled||Boolean(pending)} onclick={()=>uninstall(item.id)}><MaterialIcon name="delete" size={18} /></Button>{/if}
        </div>
      </div>
    {/each}</div>
    <div class="type-footer"><Button variant="ghost" disabled={disabled||Boolean(pending)} onclick={()=>fileInput?.click()}><MaterialIcon name="upload" size={16} />Import type package</Button></div>
    <input hidden type="file" accept=".types.json,application/json" aria-label="Import type package file" bind:this={fileInput} onchange={event=>void importFile(event.currentTarget.files?.[0])} />
    <NpmTypePreferences {value} {inherited} {repository} disabled={disabled||Boolean(pending)} {onchange}/>
  </section>
{/if}

<style>
  .type-preferences{margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-surface);border-radius:4px;min-width:0}
  .card-heading{display:flex;align-items:center;gap:12px;margin-bottom:14px}h2{margin:0;font-size:.9375rem;font-weight:650}
  p{margin:0 0 18px;font-size:.6875rem;line-height:1.6}p[role=alert]{color:var(--color-foreground)}
  .type-choice{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:var(--pane-gap);margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-background);border-radius:4px}
  .type-description{min-width:0}h3{margin:0;font-size:.75rem;font-weight:650}.type-description p{margin:4px 0;font-size:.6875rem}.package-detail{font-size:.625rem;opacity:.65}
  .type-controls{display:flex;align-items:center;gap:6px;min-width:0}.type-select{flex:1;min-width:0}.type-footer{display:flex;margin-top:12px}
  @container settings-pane (max-width:640px){.type-choice{grid-template-columns:minmax(0,1fr)}}
</style>
