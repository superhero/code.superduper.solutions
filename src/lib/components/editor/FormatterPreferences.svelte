<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import { Button } from '$lib/components/ui/button';
  import { formats, providers, selectedProvider, type FormatterChoices, type FormatDefinition, type FormatterMeasurement } from '$lib/formatting/formats';
  import { formatterPackages, installedPackages, subscribeFormatterPackages, installFormatter, removeFormatter } from '$lib/formatting/registry';
  import { formatIdFor } from '$lib/formatting/routing';
  import { mappedLanguageForPath, type LanguageMappings } from '$lib/editor/languages';
  import { readMeasurements, saveMeasurement } from '$lib/formatting/measurements';
  import { measureFormatter } from '$lib/formatting/client';
  let { value, inherited = {}, repository = false, disabled = false, files, mappings = {}, oninstalled, onchange }:
    { files?: readonly string[] | undefined; mappings?: LanguageMappings; oninstalled?(id:string):void; value: FormatterChoices; inherited?: FormatterChoices; repository?: boolean; disabled?: boolean; onchange(value: FormatterChoices): void } = $props();
  let filter = $state(''), installed = $state<{ id: string; version: string; sha256: string }[]>([]);
  let pending=$state('');
  let installController=$state.raw<AbortController>();
  let measurements = $state<FormatterMeasurement[]>([]), comparing = $state(''), error = $state('');
  let controller = $state.raw<AbortController>();
  let disposed = false;
  const ready = (id: string) => installed.some(item => item.id === id && formatterPackages.some(pack => pack.id === id && pack.sha256 === item.sha256));
  const effective = $derived({ ...inherited, ...value });
  const validMeasurements = $derived(measurements.filter(item => ready(item.provider) && formatterPackages.some(pack => pack.id === item.provider && pack.sha256 === item.sha256)));
  const relevant=$derived(new Set((files ?? ['example.js','example.ts','example.html','example.css','example.json']).map(path=>formatIdFor(path,mappedLanguageForPath(path,mappings)))));
  const visible = $derived([...formats].sort((a,b)=>Number(relevant.has(b.id))-Number(relevant.has(a.id)) || a.label.localeCompare(b.label,'en')).filter(format => `${format.label} ${format.providers.map(id=>providers.find(p=>p.id===id)?.name).join(' ')}`.toLowerCase().includes(filter.toLowerCase())));
  async function refresh() {
    try { const records = await installedPackages(); if (!disposed) installed = records; }
    catch (failure) { if (!disposed) error = String(failure); }
  }
  onMount(() => {
    const unsubscribe = subscribeFormatterPackages(() => { controller?.abort(); void refresh(); });
    void refresh();
    void readMeasurements().then(values => { if (!disposed) measurements = values; }).catch(failure => { if (!disposed) error = String(failure); });
    return () => { disposed = true; controller?.abort(); installController?.abort(); unsubscribe(); };
  });
  async function install(id:string){
    const item=formatterPackages.find(item=>item.id===id);
    if(!item || disabled || pending || comparing)return;
    pending=id;error='';installController=new AbortController();
    try{await installFormatter(item,()=>{},installController.signal);if(!disposed){await refresh();oninstalled?.(id);}}
    catch(failure){if(!disposed && !installController.signal.aborted)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';installController=undefined;}
  }
  async function uninstall(id:string){
    if(disabled || pending || comparing)return;
    pending=id;error='';
    try{await removeFormatter(id);if(!disposed)await refresh();}
    catch(failure){if(!disposed)error=failure instanceof Error?failure.message:String(failure);}
    finally{if(!disposed)pending='';}
  }
  function choose(format: string, provider: string) {
    const next = { ...value };
    if (provider === 'inherit') delete next[format]; else next[format] = provider;
    onchange(next);
  }
  function selection(format: FormatDefinition, choices: FormatterChoices) {
    const id=selectedProvider(format,choices);
    return ready(id) || Object.hasOwn(choices,format.id) ? id : 'none';
  }
  function items(format: FormatDefinition) {
    return [
      ...(repository ? [{ value:'inherit', label:`Inherited · ${providers.find(p=>p.id===selection(format,inherited))?.name ?? 'Disabled'}`, icon:'public' }] : []),
      ...format.providers.map(id => ({ value:id, label:`${providers.find(p=>p.id===id)!.name}${ready(id) ? '' : ' · Not installed'}`, icon:'format_align_left' })),
      { value:'none', label:'Disabled', icon:'block' },
    ];
  }
  async function compare(format: FormatDefinition) {
    if (comparing || pending || disabled) return;
    controller = new AbortController(); comparing = format.id; error = '';
    try {
      for (const id of format.providers.filter(ready)) {
        const pack = formatterPackages.find(item=>item.id===id)!;
        const result = await measureFormatter({ path:`sample.${format.extension}`, language:format.id, text:format.sample, indentSize:2,
          indentWithTabs:false, formatters:{ ...effective,[format.id]:id } },controller.signal);
        if (disposed || controller.signal.aborted) return;
        const item = { ...result, provider:id, format:format.id, sha256:pack.sha256, measuredAt:Date.now() };
        await saveMeasurement(item);
        if (!disposed) measurements = [...measurements.filter(old=>old.provider!==id || old.format!==format.id),item];
      }
    } catch (failure) { if (!disposed && !controller.signal.aborted) error = failure instanceof Error ? failure.message : String(failure); }
    finally { if (!disposed) comparing = ''; controller = undefined; }
  }
</script>
<section class="formatter-preferences" aria-label="Formatters">
  <div class="heading"><MaterialIcon name="align_horizontal_left" /><div><h2>Formatters</h2></div></div>
  <input class="search" aria-label="Find a formatter preference" placeholder="Filter languages or formatters" type="search" bind:value={filter} />
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="preferences-list">{#each visible as format (format.id)}
    {@const selected=selection(format,effective)}
    {@const managed=formatterPackages.find(item=>item.id===(selected!=='none'?selected:format.providers.find(id=>installed.some(record=>record.id===id))))}
    {@const current=installed.find(record=>record.id===managed?.id)}
    <div class="preference" data-format={format.id} data-formatter={managed?.id}>
      <span class="format-label">{format.label}</span>
      <div class="formatter-controls"><div class="formatter-select">
        <NavigationDropdown matchTriggerWidth label={`${format.label} formatter`} value={repository && !Object.hasOwn(value,format.id)?'inherit':selected}
          placeholder="Disabled" disabled={disabled || Boolean(pending) || Boolean(comparing)} items={items(format)} onchange={id=>choose(format.id,id)} />
      </div>
      {#if managed}
        <span class="sr-only" role="status">{pending===managed.id?'Installing…':ready(managed.id)?'Installed':current?`${current.version} installed · Update available`:'Not installed'}</span>
        {#if pending===managed.id && installController}<Button variant="ghost" onclick={()=>installController?.abort()}>Cancel</Button>
        {:else}
          {#if !ready(managed.id) && (selected!=='none' || current)}<Button variant="ghost" disabled={disabled || Boolean(pending) || Boolean(comparing)} aria-label={`${current?'Update':'Install'} ${managed.name}`} onclick={()=>install(managed.id)}>{current?'Update':'Install'}</Button>{/if}
          {#if current}<Button variant="ghost" size="icon" tooltip="Uninstall" aria-label={`Uninstall ${managed.name}`} disabled={disabled || Boolean(pending) || Boolean(comparing)} onclick={()=>uninstall(managed.id)}><MaterialIcon name="delete" size={18} /></Button>{/if}
        {/if}
      {/if}
      {#if format.providers.length>1 && format.providers.some(ready)}<Button variant="ghost" size="icon" tooltip="Compare installed" disabled={disabled || Boolean(pending) || Boolean(comparing) || !format.providers.some(ready)} aria-label={`Compare ${format.label} formatters`} onclick={()=>compare(format)}><MaterialIcon name="speed" size={18} /></Button>{/if}
      {#if comparing===format.id}<Button variant="ghost" onclick={()=>controller?.abort()}>Cancel</Button>{/if}
      </div>
      {#each validMeasurements.filter(item=>item.format===format.id) as measurement}
        <small class="measurement">{providers.find(p=>p.id===measurement.provider)?.name}: first use {measurement.coldMs.toFixed(1)} ms · subsequent {measurement.warmMs.toFixed(1)} ms</small>
      {/each}
    </div>
  {/each}
  {#if !visible.length}<p>No matching languages.</p>{/if}
  </div>
</section>
<style>
  .formatter-preferences { margin-top:20px; padding:24px; background:var(--color-surface); border-radius:4px; }
  .heading{display:flex;gap:12px;margin-bottom:22px;align-items:center}
  h2{margin:0;font-size:0.9375rem;font-weight:650}p{font-size:0.75rem;line-height:1.6;margin:6px 0 18px}
  input{width:100%;background:var(--color-background);color:var(--color-foreground);border:0;border-radius:4px;padding:8px 11px;font-size:0.6875rem}
  .preferences-list{margin-top:6px}
  .preference{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;align-items:center;margin-bottom:6px;font-size:0.6875rem;min-width:0}
  .formatter-controls{display:flex;align-items:center;gap:6px;min-width:0}.formatter-select{flex:1;min-width:0}
  .format-label{display:flex;align-items:center;justify-content:flex-end;text-align:right;min-height:36px;padding:8px 11px;border-radius:4px;background:var(--palette-8);color:var(--color-background);font-weight:650;overflow-wrap:anywhere}
  .measurement{grid-column:2;font-family:monospace;font-size:0.625rem;line-height:1.6}
</style>
