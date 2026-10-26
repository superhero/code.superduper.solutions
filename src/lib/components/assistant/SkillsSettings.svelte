<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import { mergeSkills, normalizeSkills, parseSkill, type AISkill, type AISkills } from '$lib/assistant/skills';
  let { value, inherited = {}, disabled = false, onchange }: { value: AISkills; inherited?: AISkills; disabled?: boolean; onchange(value: AISkills): void } = $props();
  const skills = $derived(mergeSkills(inherited,value));
  const entries = $derived(Object.entries(skills).filter((entry): entry is [string,AISkill] => entry[1] !== null).sort(([a],[b]) => a.localeCompare(b)));
  let editing = $state(''), formOpen = $state(false), name = $state(''), description = $state(''), instructions = $state(''), failure = $state('');
  let fileInput: HTMLInputElement | undefined = $state();
  function reset() { editing='';name='';description='';instructions='';failure='';formOpen=false; }
  function edit(key: string, skill: AISkill) { editing=key;name=key;description=skill.description;instructions=skill.instructions;failure='';formOpen=true; }
  function save() {
    const key=name.trim(), next={ ...value, [key]: {description:description.trim(),instructions,enabled:skills[key]?.enabled ?? true} };
    const normalized=normalizeSkills(next);
    if (!normalized[key] || Object.keys(next).length>32 || Object.keys(normalized).length !== Object.keys(next).length) { failure='Use a unique lowercase hyphenated name, a description and instructions. Maximum 32 skills, 1024 description characters and 64 KiB per skill.';return; }
    if (!editing && Object.hasOwn(skills,key)) { failure='A skill with that name already exists. Edit it instead.';return; }
    onchange(normalized); reset();
  }
  async function importFile(event: Event) {
    const input=event.currentTarget as HTMLInputElement, file=input.files?.[0]; if(!file)return;
    try { if(file.size>67584)throw new Error('Skill file exceeds the 66 KiB limit.'); const parsed=parseSkill(await file.text());
      editing=Object.hasOwn(skills,parsed.name)?parsed.name:'';name=parsed.name;description=parsed.skill.description;instructions=parsed.skill.instructions;failure='';formOpen=true;
    } catch(error) { failure=error instanceof Error?error.message:'Could not import skill.'; }
    input.value='';
  }
</script>
<div class="skills-settings">
  <div class="skill-toolbar"><Button size="sm" variant="ghost" {disabled} onclick={()=>{reset();formOpen=true;}}><MaterialIcon name="add" size={16}/>New skill</Button><Button size="sm" variant="ghost" {disabled} onclick={()=>fileInput?.click()}><MaterialIcon name="upload_file" size={16}/>Import SKILL.md</Button><input bind:this={fileInput} type="file" accept=".md,text/markdown,text/plain" aria-label="Import skill file" hidden {disabled} onchange={importFile}/></div>
  {#each entries as [key,skill] (key)}
    <div class="skill-row"><input type="checkbox" role="switch" aria-label={`Enable skill ${key}`} checked={skill.enabled} {disabled} onchange={event=>onchange({...value,[key]:{...skill,enabled:event.currentTarget.checked}})}/><div class="skill-name"><span>{key}</span><p>{skill.description}</p></div><Button variant="ghost" size="icon-sm" aria-label={`Edit skill ${key}`} tooltip="Edit skill" {disabled} onclick={()=>edit(key,skill)}><MaterialIcon name="edit" size={16}/></Button><Button variant="ghost" size="icon-sm" aria-label={`Remove skill ${key}`} tooltip="Remove skill" {disabled} onclick={()=>{const next={...value};if(inherited[key])next[key]=null;else delete next[key];onchange(next);if(editing===key)reset();}}><MaterialIcon name="delete" size={16}/></Button></div>
  {/each}
  {#if formOpen}<form class="skill-form" onsubmit={event=>{event.preventDefault();save();}}>
    <label>Name<input aria-label="Skill name" maxlength="64" bind:value={name} disabled={disabled||Boolean(editing)} required/></label>
    <label>Description<textarea aria-label="Skill description" rows="2" maxlength="1024" bind:value={description} {disabled} required></textarea></label>
    <label>Instructions<textarea aria-label="Skill instructions" rows="8" maxlength="65536" bind:value={instructions} {disabled} required></textarea></label>
    <div class="skill-actions"><Button variant="ghost" {disabled} onclick={reset}>Cancel</Button><Button type="submit" {disabled}>Save skill<MaterialIcon name="save" size={16}/></Button></div>
  </form>{/if}
  {#if failure}<p role="alert">{failure}</p>{/if}
</div>
<style>
  .skills-settings { display:grid;gap:12px; }
  .skill-toolbar,.skill-row,.skill-actions { display:flex;align-items:center;gap:8px; }
  .skill-toolbar,.skill-actions { flex-wrap:wrap; }
  .skill-toolbar :global(.button-content) { height:100%;align-items:center;line-height:1; }
  .skill-row { min-width:0; }
  .skill-name { flex:1;min-width:0;overflow-wrap:anywhere; }
  .skill-name p { margin:3px 0 0;opacity:.7;font-size:.6875rem; }
  .skill-form { display:grid;gap:12px;padding:var(--pane-padding);border-radius:4px;background:var(--color-background); }
  label { display:grid;gap:5px;font-size:.6875rem; }
  input:not([type="checkbox"]),textarea { width:100%;padding:8px;border:0;border-radius:4px;background:var(--color-surface);color:inherit;font:inherit; }
  textarea { resize:vertical; }
  .skill-actions { justify-content:flex-end; }
  input[type="checkbox"] { appearance:none;flex:0 0 32px;height:19px;border:0;border-radius:20px;background:var(--color-background);position:relative;cursor:pointer; }
  input[type="checkbox"]::before { content:"";position:absolute;width:11px;height:11px;top:4px;left:4px;border-radius:50%;background:var(--color-foreground); }
  input[type="checkbox"]:checked { background:var(--color-foreground); }
  input[type="checkbox"]:checked::before { left:17px;background:var(--color-background); }
  input:focus-visible,textarea:focus-visible { outline:none;background:var(--color-hover-background); }
  [role="alert"] { margin:0;color:var(--color-error-foreground);background:var(--color-error-background);padding:8px;border-radius:4px; }
</style>
