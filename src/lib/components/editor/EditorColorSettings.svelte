<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { Button } from "$lib/components/ui/button";
  import { COLOR_ROLES, DEFAULT_COLOR_MAPPINGS, colorSources, type ColorMappings, type ColorMapping, type ColorRole, type ColorSource } from "$lib/editor/color-mappings";
  import { colorMappingPreview } from "$lib/editor/highlighting";

  let { value, inherited = {}, repository = false, selectionOpacity, opacityOverride = false, disabled = false,
    onchange, onopacitychange, onresetopacity }: {
    value: ColorMappings; inherited?: ColorMappings; repository?: boolean; selectionOpacity: number;
    opacityOverride?: boolean; disabled?: boolean; onchange(value: ColorMappings): void;
    onopacitychange(value: number): void; onresetopacity(): void;
  } = $props();
  let query = $state("");
  let pendingWeight = $state<Partial<Record<ColorRole, number>>>({});
  let pendingOpacity = $state<number>();
  const effective = $derived({ ...inherited, ...value });
  const rows = $derived(COLOR_ROLES.filter(role => role.label.toLowerCase().includes(query.trim().toLowerCase())));
  const recipe = (id: ColorRole): Readonly<ColorMapping> => effective[id] ?? DEFAULT_COLOR_MAPPINGS[id];
  const baseline = (id: ColorRole): Readonly<ColorMapping> => inherited[id] ?? DEFAULT_COLOR_MAPPINGS[id];
  const backgroundRoles = $derived(rolesMatchingSource("background"));
  const surfaceRoles = $derived(rolesMatchingSource("surface"));
  function rolesMatchingSource(source: ColorSource) {
    const resolved = {} as Record<ColorRole, boolean>;
    const matches = (candidate: ColorSource): boolean => candidate === source
      || (candidate.startsWith("role-") && resolved[candidate.slice(5) as ColorRole]);
    for (const { id } of COLOR_ROLES) {
      const mapping = recipe(id);
      resolved[id] = !mapping.mix || mapping.weight === 100 ? matches(mapping.source)
        : mapping.weight === 0 ? matches(mapping.mix) : matches(mapping.source) && matches(mapping.mix);
    }
    return resolved;
  }
  function choose(id: ColorRole, mapping?: ColorMapping) {
    const next = { ...value };
    if (mapping) next[id] = mapping; else delete next[id];
    onchange(next);
  }
  function resetMix(id: ColorRole) {
    const current = recipe(id), initial = baseline(id);
    if (disabled || !current.mix) return;
    const next = { ...current, weight: initial.weight ?? 50 };
    choose(id, next.source === initial.source && next.mix === initial.mix && next.weight === initial.weight ? undefined : next);
    delete pendingWeight[id];
  }
  function sourceLabel(id: ColorRole, source: ColorSource) {
    return colorSources(id).find(item => item.value === source)!.label;
  }
</script>

{#snippet colorOption(item: { value: string; label: string; icon: string })}
  <span class="color-option">{#if item.value.startsWith("palette-")}<span class="option-swatch" style={`background:var(--${item.value})`} aria-hidden="true"></span>{/if}{item.label}</span>
{/snippet}

<section class="editor-colors" aria-label="Editor colors" use:colorMappingPreview={{ colorMappings: effective, selectionOpacity }}>
  <div class="card-heading"><MaterialIcon name="palette" /><h2>Editor colors</h2>
    <Button variant="ghost" size="icon" aria-label="Reset color mappings" tooltip={repository ? "Inherit color mappings" : "Restore default color mappings"}
      {disabled} onclick={() => onchange({})}><MaterialIcon name="restart_alt" size={18} /></Button>
  </div>
  <input class="color-search" aria-label="Filter editor colors" placeholder="Filter color mappings" bind:value={query} />
  <div class="color-grid">
    {#each rows as role (role.id)}
      {@const current = recipe(role.id)}
      {@const options = colorSources(role.id).map(item => ({ ...item, icon: "palette" }))}
      <div class="color-row" data-color-role={role.id}>
        <label class="color-label" for={`color-${role.id}`}>{role.label}</label>
        <div class="color-controls">
          <div class="source-row">
            <span class="color-swatch" class:background-swatch={backgroundRoles[role.id]} class:surface-swatch={surfaceRoles[role.id]} aria-label={`${role.label} color preview`} role="img" style={`background:var(--syntax-${role.id})`}></span>
            <NavigationDropdown id={`color-${role.id}`} matchTriggerWidth label={`${role.label} color`} placeholder="Color"
              value={Object.hasOwn(value, role.id) ? current.source : "inherit"} itemLabel={colorOption} {disabled}
              items={[{ value: "inherit", label: `${repository ? "Inherited · " : ""}${sourceLabel(role.id, baseline(role.id).source)}`, icon: "restart_alt" }, ...options]}
              onchange={source => source === "inherit" ? choose(role.id) : choose(role.id, { ...current, source: source as ColorSource })} />
            <Button variant="ghost" size="icon" aria-label={`Blend ${role.label} color`} aria-pressed={Boolean(current.mix)}
              tooltip="Blend two colors" {disabled} onclick={() => choose(role.id, current.mix ? { source: current.source }
                : { ...current, mix: "foreground", weight: 50 })}><MaterialIcon name="gradient" size={18} /></Button>
          </div>
          {#if current.mix}
            <div class="mix-row">
              <NavigationDropdown matchTriggerWidth label={`${role.label} mix color`} placeholder="Mix with" value={current.mix}
                items={options} itemLabel={colorOption} {disabled} onchange={mix => choose(role.id, { ...current, mix: mix as ColorSource })} />
            </div>
          {/if}
        </div>
        {#if current.mix}
          <div class="color-slider-row mix-slider-row">
            <div class="slider-label"><label for={`color-${role.id}-weight`}>Mix</label><output for={`color-${role.id}-weight`}>{pendingWeight[role.id] ?? current.weight}% / {100 - (pendingWeight[role.id] ?? current.weight!)}%</output></div>
            <div class="slider-controls">
              <input id={`color-${role.id}-weight`} aria-label={`${role.label} color mix`} type="range" min="0" max="100" step="1"
                value={current.weight} {disabled} oninput={event => pendingWeight[role.id] = Number(event.currentTarget.value)}
                onchange={event => { choose(role.id, { ...current, weight: Number(event.currentTarget.value) }); delete pendingWeight[role.id]; }} />
              <Button variant="ghost" size="icon" aria-label={`Reset ${role.label} color mix`} tooltip={repository ? "Inherit blend ratio" : "Restore default blend ratio"}
                {disabled} onclick={() => resetMix(role.id)}><MaterialIcon name="restart_alt" size={18}/></Button>
            </div>
          </div>
        {/if}
        {#if role.id === "selection"}
          <div class="color-slider-row opacity-row">
            <div class="slider-label"><label for="editor-selection-opacity">Opacity</label><output for="editor-selection-opacity">{pendingOpacity ?? selectionOpacity}%</output>
              {#if repository && !opacityOverride}<span>Inherited</span>{/if}
            </div>
            <div class="slider-controls">
              <input id="editor-selection-opacity" aria-label="Selection opacity" type="range" min="0" max="100" step="1" value={selectionOpacity} {disabled}
                oninput={event => pendingOpacity = Number(event.currentTarget.value)}
                onchange={event => { onopacitychange(Number(event.currentTarget.value)); pendingOpacity = undefined; }} />
              <Button variant="ghost" size="icon" aria-label="Reset selection opacity" tooltip={repository ? "Inherit selection opacity" : "Restore selection opacity"}
                {disabled} onclick={onresetopacity}><MaterialIcon name="restart_alt" size={18} /></Button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
  {#if !rows.length}<p>No matching color mappings.</p>{/if}
</section>

<style>
  .editor-colors { min-width: 0; padding: var(--pane-padding); border-radius: 4px; background: var(--color-surface); }
  .card-heading { display: flex; align-items: center; gap: 12px; margin-bottom: var(--pane-padding); }
  h2 { margin: 0; font-size: .9375rem; font-weight: 650; }
  .card-heading :global(button) { margin-left: auto; }
  .color-search { width: 100%; margin-bottom: 12px; padding: 8px 11px; border: 0; border-radius: 4px; background: var(--color-background); color: var(--color-foreground); font-size: .6875rem; }
  .color-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pane-padding); align-items: start; }
  .color-row { display: grid; grid-template-columns: minmax(100px, 140px) minmax(0, 1fr); gap: 0; align-items: start; min-width: 0; }
  .color-label { display: flex; align-items: center; justify-content: flex-end; text-align: right; box-sizing: border-box; height: 36px; min-height: 36px; padding: 1px 8px; border-block: 1px solid var(--color-background); border-radius: 4px 0 0 4px; background: var(--palette-8); color: var(--color-background); font-size: .6875rem; line-height: 1.25; font-weight: 650; overflow-wrap: anywhere; }
  .color-controls, .source-row :global(.navigation-trigger), .mix-row :global(.navigation-trigger) { min-width: 0; }
  .source-row { display: flex; align-items: center; gap: 0; border-radius: 0 4px 4px 0; background: var(--color-background); overflow: hidden; }
  .color-swatch, .option-swatch { box-sizing: border-box; border: 1px solid var(--color-background); border-radius: 0; }
  .color-swatch { flex: 0 0 36px; width: 36px; height: 36px; }
  .color-swatch.background-swatch { border-right-color: var(--palette-8); }
  .color-option { display: flex; align-items: center; gap: 8px; }.option-swatch { flex: 0 0 16px; width: 16px; height: 16px; }
  .source-row :global(.navigation-trigger), .mix-row :global(.navigation-trigger) { flex: 1; background: var(--color-background); padding-inline: 11px; }
  .source-row :global(button.navigation-trigger) { border-block: 1px solid var(--color-background); border-radius: 0; }
  .source-row :global(button[data-slot="button"]) { border-block: 1px solid var(--color-background); border-radius: 0 4px 4px 0; }
  .mix-row { display: grid; gap: 8px; margin: 8px 0 0 36px; }
  .color-slider-row { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(100px, 140px) minmax(0, 1fr); align-items: center; margin-top: 8px; min-width: 0; }
  .slider-label { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 0 6px; min-width: 0; min-height: 36px; padding-right: 8px; text-align: right; line-height: 1.25; }
  label, output { font-size: .6875rem; }
  output { white-space: nowrap; }
  .slider-label span { flex-basis: 100%; font-size: .5625rem; }
  .slider-controls { display: flex; align-items: center; gap: 6px; min-width: 0; margin-left: 36px; }
  input[type="range"] { flex: 1; min-width: 0; appearance: none; width: 100%; height: 36px; margin: 0; border: 0; background: transparent; cursor: pointer; }
  input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-moz-range-track { height: 4px; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; margin-top: -5px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  p { font-size: .75rem; }
  @container settings-pane (max-width: 1000px) { .color-grid { grid-template-columns: minmax(0, 1fr); } }
  @container settings-pane (max-width: 550px) {
    .color-row { grid-template-columns: minmax(0, 1fr); }
    .color-label { justify-content: flex-start; text-align: left; border-right: 1px solid var(--color-background); border-radius: 4px 4px 0 0; }
    .source-row { border-radius: 0 0 4px 4px; }
    .color-swatch { border-bottom-left-radius: 4px; }
    .color-swatch:not(.surface-swatch) { border-left: 0; }
    .source-row :global(button[data-slot="button"]) { border-radius: 0 0 4px 0; }
    .color-slider-row { grid-template-columns: minmax(80px, 30%) minmax(0, 1fr); }
    .slider-controls { margin-left: 0; }
  }
</style>
