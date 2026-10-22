<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import {onMount} from 'svelte';
  import {Button} from '$lib/components/ui/button';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import {commonTypeLibraries,npmTypeId,type TypeLibraryChoices} from '$lib/intelligence/type-libraries';
  import {searchNpmTypes,NPM_TYPE_LIMITS,type NpmTypeResult} from '$lib/intelligence/npm-types';
  import {npmTypeRegistry} from '$lib/intelligence/npm-type-registry';
  import {packageSize,type FormatterPackage} from '$lib/formatting/packages';
  let {value,inherited={},repository=false,disabled=false,onchange}:{value:TypeLibraryChoices;inherited?:TypeLibraryChoices;repository?:boolean;disabled?:boolean;onchange(value:TypeLibraryChoices):void}=$props();
  type Row={name:string;description:string;included?:boolean};
  let query=$state(''),limit=$state(8),results=$state<NpmTypeResult[]>([]),searched=$state(false),searching=$state(false),nativeOpen=$state(false);
  let installed=$state<FormatterPackage[]>([]),pending=$state(''),phase=$state(''),error=$state('');
  let input=$state<HTMLInputElement>();
  let disposed=false,revision=0,searchRevision=0,controller:AbortController|undefined,searchController:AbortController|undefined;
  const effective=$derived({...inherited,...value});
  const known=$derived(new Map(installed.map(item=>[item.id,item])));
  const matches=(name:string,description:string)=>`${name} ${description}`.toLowerCase().includes(query.trim().toLowerCase());
  const rows=$derived.by(()=>{
    const candidates=new Map<string,Row>();
    for(const item of commonTypeLibraries)if(item.group!=='Included types')candidates.set(item.name,item);
    for(const item of installed)if(!commonTypeLibraries.some(common=>common.name===item.name))candidates.set(item.name,{name:item.name,description:'Installed npm declarations.'});
    for(const item of results)if(!commonTypeLibraries.some(common=>common.name===item.name))candidates.set(item.name,item);
    return [...candidates.values()].filter(item=>matches(item.name,item.description));
  });
  const nativeRows=$derived(commonTypeLibraries.filter(item=>item.group==='Included types'&&matches(item.name,item.description)));
  async function refresh(){const current=++revision;try{const records=await npmTypeRegistry.installedPackages();if(!disposed&&current===revision)installed=records;}catch(failure){if(!disposed)error=String(failure);}}
  onMount(()=>{disposed=false;void refresh();const unsubscribe=npmTypeRegistry.subscribe(()=>void refresh());return()=>{disposed=true;revision++;searchRevision++;controller?.abort();searchController?.abort();unsubscribe();};});
  function choose(name:string,selection:string){const next={...value},id=npmTypeId(name);if(selection==='inherit')delete next[id];else next[id]=selection==='enabled';onchange(next);}
  function changedQuery(){searchRevision++;searchController?.abort();searching=false;results=[];searched=false;limit=8;if(!pending)error='';}
  async function search(){
    if(disabled||!query.trim())return;searchController?.abort();const active=new AbortController();searchController=active;const current=++searchRevision;
    searching=true;error='';
    try{const found=await searchNpmTypes(query,active.signal);if(!disposed&&current===searchRevision){results=found;searched=true;limit=30;}}
    catch(failure){if(!disposed&&current===searchRevision&&!active.signal.aborted)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed&&current===searchRevision)searching=false;}
  }
  async function install(name:string){
    if(disabled||pending)return;pending=npmTypeId(name);phase='Connecting to npm…';error='';const active=new AbortController();controller=active;
    try{await npmTypeRegistry.installPackage(name,message=>{if(!disposed)phase=message;},active.signal);if(!disposed){await refresh();choose(name,'enabled');}}
    catch(failure){if(!disposed&&!active.signal.aborted)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed){pending='';phase='';}controller=undefined;}
  }
  async function remove(item:FormatterPackage){
    if(disabled||pending)return;pending=item.id;error='';
    try{await npmTypeRegistry.removePackage(item.id);if(!disposed)await refresh();}
    catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';}
  }
  async function exportFile(item:FormatterPackage){
    if(disabled||pending)return;pending=item.id;error='';
    try{const {envelope}=await npmTypeRegistry.readPackage(item);if(disposed)return;
      const url=URL.createObjectURL(new Blob([JSON.stringify({item,envelope})],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`${item.name.replaceAll('/','-')}-${item.version}.npm-types.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';}
  }
  async function importFile(file:File|undefined){
    if(!file||disabled||pending)return;pending='import';error='';const active=new AbortController();controller=active;
    try{if(file.size>NPM_TYPE_LIMITS.total*2)throw new Error('This type package file is too large.');await npmTypeRegistry.importPackage(await file.arrayBuffer(),active.signal);if(!disposed)await refresh();}
    catch(failure){if(!disposed&&!active.signal.aborted)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';if(input)input.value='';controller=undefined;}
  }
</script>

{#snippet row(library:Row)}
  {@const id=npmTypeId(library.name)}{@const current=known.get(id)}
  <div class="npm-type-row" data-npm-type={library.name}>
    <div class="description"><h4>{library.name}</h4><p>{library.description}</p><span class="detail">{current?`${current.version} · ${packageSize(current.bytes)}`:library.included?'Types included in the library':'Community declarations'}</span></div>
    <div class="controls"><div class="selection"><NavigationDropdown matchTriggerWidth placeholder="Disabled" label={`${library.name} types`} value={repository&&!Object.hasOwn(value,id)?'inherit':effective[id]?'enabled':'disabled'} disabled={disabled||Boolean(pending)}
      items={[...(repository?[{value:'inherit',label:`Inherited · ${inherited[id]?'Enabled':'Disabled'}`,icon:'public'}]:[]),{value:'enabled',label:'Enabled',icon:'check'},{value:'disabled',label:'Disabled',icon:'block'}]} onchange={selection=>choose(library.name,selection)} /></div>
      <Button variant="ghost" disabled={disabled||Boolean(pending)} aria-label={`${current?'Update':'Install'} ${library.name} types`} onclick={()=>install(library.name)}>{pending===id?'Installing…':current?'Update':'Install'}</Button>
      {#if current}
        <Button variant="ghost" size="icon" tooltip="Export package" aria-label={`Export ${library.name} types`} disabled={disabled||Boolean(pending)} onclick={()=>exportFile(current)}><MaterialIcon name="download" size={18}/></Button>
        <Button variant="ghost" size="icon" tooltip="Uninstall" aria-label={`Uninstall ${library.name} types`} disabled={disabled||Boolean(pending)} onclick={()=>remove(current)}><MaterialIcon name="delete" size={18}/></Button>
      {/if}
    </div>
  </div>
{/snippet}

<section class="npm-types" aria-label="npm type libraries">
  <h3>Common packages</h3>
  <p>Install declarations for the libraries you use, or search npm for more.</p>
  <form class="search" onsubmit={event=>{event.preventDefault();void search();}}>
    <input type="search" aria-label="Find type packages" placeholder="Filter packages or search npm" bind:value={query} oninput={changedQuery}/>
    <Button type="submit" variant="ghost" disabled={disabled||searching||!query.trim()}><MaterialIcon name="search" size={16}/>{searching?'Searching…':'Search npm'}</Button>
  </form>
  {#if error}<p class="message" role="alert">{error}</p>{/if}
  {#if phase}<div class="progress"><p role="status">{phase}</p><Button variant="ghost" onclick={()=>controller?.abort()}>Cancel</Button></div>{/if}
  {#each rows.slice(0,limit) as library (library.name)}{@render row(library)}{/each}
  {#if rows.length>limit}<Button class="more" variant="ghost" onclick={()=>limit+=8}>Show {Math.min(8,rows.length-limit)} more packages</Button>{/if}
  {#if !rows.length&&!nativeRows.length}<p role="status">{searched?'No matching type packages found on npm.':'No matching common packages. Search npm to find more.'}</p>{/if}
  {#if nativeRows.length}<details open={nativeOpen||Boolean(query.trim())} ontoggle={event=>nativeOpen=event.currentTarget.open}>
    <summary><MaterialIcon name="code" size={18}/>Libraries with included types</summary>
    {#if nativeOpen||query.trim()}<p>These libraries ship their own declarations. Installing their types adds API information for JavaScript and TypeScript; component template intelligence is separate.</p>
      {#each nativeRows as library (library.name)}{@render row({...library,included:true})}{/each}
    {/if}
  </details>{/if}
  <div class="footer"><Button variant="ghost" disabled={disabled||Boolean(pending)} onclick={()=>input?.click()}><MaterialIcon name="upload" size={16}/>Import npm types</Button></div>
  <input hidden type="file" accept=".npm-types.json,application/json" aria-label="Import npm type package file" bind:this={input} onchange={event=>void importFile(event.currentTarget.files?.[0])}/>
</section>

<style>
  .npm-types{margin-top:24px;min-width:0}h3{margin:0;font-size:.875rem;font-weight:650}p{margin:6px 0 14px;font-size:.6875rem;line-height:1.6}
  .search{display:flex;gap:8px;align-items:center;margin:12px 0}.search>input{flex:1;min-width:0;padding:9px 11px;border:0;border-radius:4px;background:var(--color-background);color:var(--color-foreground);font-size:.6875rem}
  .npm-type-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:center;gap:12px;margin-top:6px;padding:12px;background:var(--color-background);border-radius:4px}
  .description{min-width:0;overflow-wrap:anywhere}h4{margin:0;font-size:.75rem;font-weight:650}.description p{margin:4px 0}.detail{font-size:.625rem;opacity:.65}
  .controls{display:flex;align-items:center;gap:6px;min-width:0}.selection{flex:1;min-width:0}.footer{display:flex;margin-top:12px}.progress{display:flex;align-items:center;gap:12px}.progress p{margin:0;flex:1}.message{margin:12px 0}
  details{margin-top:18px}summary{display:flex;align-items:center;gap:8px;cursor:pointer;list-style:none;font-size:.75rem;font-weight:650}summary::-webkit-details-marker{display:none}
  .npm-types :global(.more){width:100%;margin-top:6px}
  @media(max-width:640px){.npm-type-row{grid-template-columns:minmax(0,1fr)}.search{flex-wrap:wrap}.search>input{flex-basis:100%}}
</style>
