<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import { Button } from '$lib/components/ui/button';
  import { DEFAULT_LANGUAGE_MAPPINGS, relevantLanguageMappings, LANGUAGE_OPTIONS, normalizeSuffix, type LanguageMappings } from '$lib/editor/languages';
  let {value,inherited={},repository=false,files,disabled=false,onchange}: {
    files?:readonly string[] | undefined;value:LanguageMappings;inherited?:LanguageMappings;repository?:boolean;disabled?:boolean;onchange(value:LanguageMappings):void;
  }=$props();
  let query=$state(''),suffix=$state(''),language=$state('text'),limit=$state(4),error=$state('');
  const languages=LANGUAGE_OPTIONS.filter(item=>item.id!=='auto');
  const label=(id:string)=>languages.find(item=>item.id===id)?.label??id;
  const baseline=$derived({...DEFAULT_LANGUAGE_MAPPINGS,...inherited});
  const relevant=$derived(relevantLanguageMappings(files,{...inherited,...value}));
  const remaining=$derived(Object.entries({...baseline,...value}).filter(([suffix])=>!Object.hasOwn(relevant,suffix)).sort(([a],[b])=>a.localeCompare(b,'en')));
  const rows=$derived([...Object.entries(relevant).sort(([a],[b])=>a.localeCompare(b,'en')),
    ...remaining]
    .filter(([suffix,id])=>`${suffix} ${label(id)}`.toLowerCase().includes(query.trim().toLowerCase())));
  function choose(suffix:string,id:string){
    const next={...value};if(id==='inherit')delete next[suffix];else next[suffix]=id;onchange(next);
  }
  function add(){
    const normalized=normalizeSuffix(suffix);
    if(!normalized){error='Enter a suffix such as .ts or .test.js.';return;}
    error='';choose(normalized,language);suffix='';query=normalized;limit=20;
  }
</script>
<section aria-label="Language mappings" class="filename-mappings">
  <div class="card-heading"><MaterialIcon name="linked_services" /><div><h2>Language mappings</h2></div></div>
  <input aria-label="Filter filename mappings" placeholder="Filter suffixes or languages" bind:value={query} oninput={()=>limit=query.trim()?20:4} />
  <form class="new-mapping" onsubmit={event=>{event.preventDefault();if(!disabled)add();}}>
    <input aria-label="Filename suffix" placeholder=".example" bind:value={suffix} {disabled} />
    <NavigationDropdown matchTriggerWidth label="Language for new suffix" placeholder="Language" value={language} {disabled}
      items={languages.map(item=>({value:item.id,label:item.label,icon:'code'}))} onchange={id=>language=id} />
    <Button type="submit" variant="ghost" size="icon" tooltip="Add" aria-label="Add" {disabled}><MaterialIcon name="add" size={18} /></Button>
  </form>
  <div class="mapping-list">
    {#each rows.slice(0,limit) as [suffix,id] (suffix)}
      <div class="mapping-row"><code>{suffix}</code>
        <NavigationDropdown matchTriggerWidth label={`Language for ${suffix}`} placeholder={label(id)} value={value[suffix]??'inherit'} {disabled}
          items={[{value:'inherit',label:`Inherited · ${label(baseline[suffix]??'text')}`,icon:'restart_alt'},
            ...languages.map(item=>({value:item.id,label:item.label,icon:'code'}))]}
          onchange={id=>choose(suffix,id)} />
      </div>
    {/each}
    {#if !rows.length}<p>No matching suffixes.</p>{/if}

    {#if rows.length>limit}<Button class="show-more" variant="ghost" onclick={()=>limit+=20}><MaterialIcon name="visibility" size={18}/>Show {Math.min(20,rows.length-limit)} more of {rows.length-limit}</Button>{/if}
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
</section>
<style>
  .filename-mappings{margin-top:var(--pane-gap);padding:var(--pane-padding);background:var(--color-surface);border-radius:4px}
  .card-heading{display:flex;gap:12px;margin-bottom:var(--pane-padding);align-items:center}
  
  h2{margin:0;font-size:0.9375rem;font-weight:650}p{font-size:0.75rem;line-height:1.6;margin:6px 0 16px}
  input{width:100%;min-width:0;background:var(--color-background);color:var(--color-foreground);border:0;border-radius:4px;padding:8px 11px;font-size:0.6875rem}
  .mapping-list{margin:6px 0 12px;}
  .mapping-list :global(.show-more){width:100%;}
  .mapping-row{display:grid;grid-template-columns:minmax(100px,140px) minmax(0,1fr);gap:0;align-items:start;margin-bottom:6px;min-width:0;border-radius:4px;background:var(--color-background);overflow:hidden}
  code{display:flex;align-items:center;justify-content:flex-end;text-align:right;box-sizing:border-box;height:36px;min-height:36px;padding:1px 8px;border-block:1px solid var(--color-background);background:var(--palette-8);color:var(--color-background);font-size:0.6875rem;line-height:1.25;overflow-wrap:anywhere}
  .mapping-row :global(button.navigation-trigger){border-block:1px solid var(--color-background);border-radius:0}
  .new-mapping{margin-top:6px;display:grid;grid-template-columns:minmax(100px,140px) minmax(0,1fr) auto;gap:0;align-items:center;min-width:0;border-radius:4px;background:var(--color-background);overflow:hidden}
  .new-mapping input,.new-mapping :global(button.navigation-trigger),.new-mapping :global(button[data-slot="button"]){border-radius:0}
  @container settings-pane (max-width:550px){.mapping-row{grid-template-columns:minmax(0,1fr)}code{justify-content:flex-start;text-align:left}.new-mapping{grid-template-columns:minmax(0,1fr) auto}.new-mapping input{grid-column:1/-1}}
</style>
