<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import applicationLicense from '../../../../LICENSE?raw';
  import applicationTerms from '../../../../LICENSE-ADDITIONAL-TERMS?raw';
  import * as language from '$lib/intelligence/registry';
  import {typeRegistry} from '$lib/intelligence/type-registry';
  import {npmTypeRegistry} from '$lib/intelligence/npm-type-registry';
  import * as formatter from '$lib/formatting/registry';
  import { syntaxRegistry } from '$lib/syntax/registry';
  import { remoteRegistry } from '$lib/remotes/registry';
  import type { FormatterNotice, FormatterPackage, PackageEnvelope } from '$lib/formatting/packages';

  type Source = {
    catalog: readonly FormatterPackage[];
    installedPackages(): Promise<{id:string;package?:FormatterPackage}[]>;
    readPackage(item:FormatterPackage): Promise<{envelope:PackageEnvelope}>;
    subscribe(listener:()=>void):()=>void;
  };
  const sources:Source[]=[
    {catalog:language.languagePackages,installedPackages:language.installedPackages,readPackage:language.readPackage,subscribe:language.subscribeLanguagePackages},
    {catalog:formatter.formatterPackages,installedPackages:formatter.installedPackages,readPackage:formatter.readPackage,subscribe:formatter.subscribeFormatterPackages},
    syntaxRegistry,
    remoteRegistry,
    typeRegistry,
    {catalog:[],installedPackages:async()=>(await npmTypeRegistry.installedPackages()).map(item=>({id:item.id,package:item})),readPackage:npmTypeRegistry.readPackage,subscribe:npmTypeRegistry.subscribe},
  ];
  let open=$state(false),loading=$state(false),errors=$state<string[]>([]),notices=$state<FormatterNotice[]>([]);
  let disposed=false,revision=0;
  const correspondingSource = import.meta.env.VITE_SOURCE_ARCHIVE_URL || 'https://github.com/superhero/code.superduper.solutions';
  async function refresh(){
    const current=++revision;
    if(!open || disposed)return;
    loading=true;
    const found=new Map<string,FormatterNotice>(),failures:string[]=[];
    const add=(notice:FormatterNotice)=>found.set(`${notice.name}\0${notice.version}\0${notice.text}`,notice);
    // Core notices are inert production HTML, parsed as text rather than executed.
    const core=document.querySelector<HTMLTemplateElement>('template#license-notices');
    for(const pre of core?.content.querySelectorAll('pre[data-license-source]')??[]){
      const text=pre.textContent??'';
      if(text.trim() && text.trim()!==applicationLicense.trim() && text.trim()!==applicationTerms.trim())add({name:pre.previousElementSibling?.textContent??'Core dependency',version:'',text});
    }
    // Read one optional artifact at a time, only while the notices view is open.
    for(const source of sources){
      try{
        for(const record of await source.installedPackages()){
          if(current!==revision || disposed || !open)return;
          const item=source.catalog.find(item=>item.id===record.id)??record.package;
          if(!item){failures.push(`Notices unavailable for ${record.id}; its package is no longer in this catalog.`);continue;}
          try{for(const notice of (await source.readPackage(item)).envelope.notices)if(!['LICENSE','LICENSE-ADDITIONAL-TERMS'].includes(notice.name))add(notice);}
          catch(failure){failures.push(`${item.name}: ${failure instanceof Error?failure.message:String(failure)}`);}
        }
      }catch(failure){failures.push(failure instanceof Error?failure.message:String(failure));}
    }
    if(current===revision && !disposed){notices=[...found.values()].sort((a,b)=>a.name.localeCompare(b.name,'en'));errors=failures;loading=false;}
  }
  onMount(()=>{
    const unsubscribers=sources.map(source=>source.subscribe(()=>{if(open)void refresh();}));
    return()=>{disposed=true;revision++;for(const unsubscribe of unsubscribers)unsubscribe();};
  });
</script>
<section class="license-notices" aria-label="Licenses and notices">
  <details bind:open ontoggle={event=>{open=event.currentTarget.open;if(open)void refresh();else{revision++;notices=[];errors=[];loading=false;}}}>
    <summary><MaterialIcon name="license" /><span>Licenses and notices</span></summary>
    {#if open}
      <p>Copyright © 2026 Erik Landvall. This application comes without warranty. You may redistribute it under AGPL-3.0-only and its additional terms.</p>
      <p><a href={correspondingSource}>Corresponding source</a></p>
      <details><summary>Application license · AGPL-3.0-only</summary><pre>{applicationLicense}</pre></details>
      <details><summary>Application additional terms</summary><pre>{applicationTerms}</pre></details>
      {#if loading}<p role="status">Reading notices…</p>{/if}
      {#each errors as error}<p role="alert">{error}</p>{/each}
      {#each notices as notice}<details><summary>{notice.name}{notice.version?` · ${notice.version}`:''}</summary><pre>{notice.text}</pre></details>{/each}
    {/if}
  </details>
</section>
<style>
  .license-notices{margin-top:20px;padding:24px;background:var(--color-surface);border-radius:4px;min-width:0}
  summary{display:flex;align-items:center;gap:12px;cursor:pointer;font-size:0.75rem;font-weight:700;list-style:none}
  summary::-webkit-details-marker{display:none}
  .license-notices>details>summary{font-size:0.9375rem;font-weight:650}
  details details{margin-top:12px}p{font-size:0.6875rem;line-height:1.6;margin:16px 0}
  pre{font-size:0.6875rem;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;margin:12px 0}
  a{color:inherit;text-underline-offset:3px}
  a:focus-visible{outline:0;background:var(--color-secondary);color:var(--color-secondary-foreground)}
</style>
