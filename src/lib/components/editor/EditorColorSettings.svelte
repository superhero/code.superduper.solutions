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
  function choose(id: ColorRole, mapping?: ColorMapping) {
    const next = { ...value };
    if (mapping) next[id] = mapping; else delete next[id];
    onchange(next);
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
            <span class="color-swatch" aria-label={`${role.label} color preview`} role="img" style={`background:var(--syntax-${role.id})`}></span>
            <NavigationDropdown id={`color-${role.id}`} matchTriggerWidth label={`${role.label} color`} placeholder="Color"
              value={Object.hasOwn(value, role.id) ? current.source : "inherit"} itemLabel={colorOption} {disabled}
              items={[{ value: "inherit", label: `${repository ? "Inherited" : "Default"} · ${sourceLabel(role.id, baseline(role.id).source)}`, icon: "restart_alt" }, ...options]}
              onchange={source => source === "inherit" ? choose(role.id) : choose(role.id, { ...current, source: source as ColorSource })} />
            <Button variant="ghost" size="icon" aria-label={`Blend ${role.label} color`} aria-pressed={Boolean(current.mix)}
              tooltip="Blend two colors" {disabled} onclick={() => choose(role.id, current.mix ? { source: current.source }
                : { ...current, mix: "foreground", weight: 50 })}><MaterialIcon name="gradient" size={18} /></Button>
          </div>
          {#if current.mix}
            <div class="mix-row">
              <NavigationDropdown matchTriggerWidth label={`${role.label} mix color`} placeholder="Mix with" value={current.mix}
                items={options} itemLabel={colorOption} {disabled} onchange={mix => choose(role.id, { ...current, mix: mix as ColorSource })} />
              <div class="mix-weight"><label for={`color-${role.id}-weight`}>Mix</label><output for={`color-${role.id}-weight`}>{pendingWeight[role.id] ?? current.weight}% / {100 - (pendingWeight[role.id] ?? current.weight!)}%</output>
                <input id={`color-${role.id}-weight`} aria-label={`${role.label} color mix`} type="range" min="0" max="100" step="1"
                  value={current.weight} {disabled} oninput={event => pendingWeight[role.id] = Number(event.currentTarget.value)}
                  onchange={event => { choose(role.id, { ...current, weight: Number(event.currentTarget.value) }); delete pendingWeight[role.id]; }} />
              </div>
            </div>
          {/if}
          {#if role.id === "selection"}
            <div class="opacity-row"><div><label for="editor-selection-opacity">Opacity</label><output for="editor-selection-opacity">{pendingOpacity ?? selectionOpacity}%</output>
              {#if repository && !opacityOverride}<span>Inherited</span>{/if}
              <input id="editor-selection-opacity" aria-label="Selection opacity" type="range" min="0" max="100" step="1" value={selectionOpacity} {disabled}
                oninput={event => pendingOpacity = Number(event.currentTarget.value)}
                onchange={event => { onopacitychange(Number(event.currentTarget.value)); pendingOpacity = undefined; }} />
            </div><Button variant="ghost" size="icon" aria-label="Reset selection opacity" tooltip={repository ? "Inherit selection opacity" : "Restore selection opacity"}
              {disabled} onclick={onresetopacity}><MaterialIcon name="restart_alt" size={18} /></Button></div>
          {/if}
        </div>
      </div>
    {/each}
  </div>
  {#if !rows.length}<p>No matching color mappings.</p>{/if}
</section>

<style>
  .editor-colors { min-width: 0; padding: 24px; border-radius: 4px; background: var(--color-surface); }
  .card-heading { display: flex; align-items: center; gap: 12px; margin-bottom: 22px; }
  h2 { margin: 0; font-size: .9375rem; font-weight: 650; }
  .card-heading :global(button) { margin-left: auto; }
  .color-search { width: 100%; margin-bottom: 12px; padding: 8px 11px; border: 0; border-radius: 4px; background: var(--color-background); color: var(--color-foreground); font-size: .6875rem; }
  .color-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; align-items: start; }
  .color-row { display: grid; grid-template-columns: minmax(100px, 140px) minmax(0, 1fr); gap: 12px; align-items: start; min-width: 0; }
  .color-label { display: flex; align-items: center; justify-content: flex-end; text-align: right; min-height: 36px; padding: 8px 11px; border-radius: 4px; background: var(--palette-8); color: var(--color-background); font-size: .6875rem; font-weight: 650; overflow-wrap: anywhere; }
  .color-controls, .source-row :global(.navigation-trigger), .mix-row :global(.navigation-trigger) { min-width: 0; }
  .source-row { display: flex; align-items: center; gap: 6px; }
  .color-swatch { flex: 0 0 20px; width: 20px; height: 28px; border-radius: 3px; }
  .color-option { display: flex; align-items: center; gap: 8px; }.option-swatch { flex: 0 0 16px; width: 16px; height: 16px; border-radius: 3px; }
  .source-row :global(.navigation-trigger), .mix-row :global(.navigation-trigger) { flex: 1; background: var(--color-background); padding-inline: 11px; }
  .source-row :global(button[aria-pressed="true"]) { background: var(--color-foreground); color: var(--color-background); }
  .mix-row { display: grid; gap: 8px; margin: 8px 0 0 26px; }
  .mix-weight, .opacity-row > div { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; flex: 1; }
  label, output, .opacity-row span { font-size: .6875rem; }
  .opacity-row { display: flex; align-items: center; gap: 6px; margin: 8px 0 0 26px; }
  .opacity-row span { margin-left: auto; font-size: .5625rem; }
  input[type="range"] { flex: 1 0 100%; appearance: none; width: 100%; height: 18px; margin: 0; border: 0; background: transparent; cursor: pointer; }
  input[type="range"]::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-moz-range-track { height: 4px; border-radius: 4px; background: var(--color-background); }
  input[type="range"]::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; margin-top: -5px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 50%; background: var(--color-foreground); }
  p { font-size: .75rem; }
  @media (max-width: 1000px) { .color-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 550px) { .color-row { grid-template-columns: minmax(0, 1fr); gap: 6px; }.color-label { justify-content: flex-start; text-align: left; }.mix-row, .opacity-row { margin-left: 26px; } }
</style>
