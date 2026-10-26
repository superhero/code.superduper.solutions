<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { tick, type Snippet } from "svelte";
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import WidthDivider from "./WidthDivider.svelte";
  import { SETTINGS_TABS, type SettingsTab } from "$lib/editor/settings-tabs";

  let { open = $bindable(false), tab = $bindable<SettingsTab>("appearance"), tabsDisabled = false, width, maximumWidth, resizeDisabled = false,
    onresizestart, onresizepreview, onresizeend, header, toolbar, children }:
    { open?: boolean; tab?: SettingsTab; tabsDisabled?: boolean; width: number; maximumWidth: number; resizeDisabled?: boolean;
      onresizestart(): void; onresizepreview(width: number): void;
      onresizeend(width: number | undefined): void; header: Snippet; toolbar: Snippet; children: Snippet } = $props();

  function scrollTabs(event: WheelEvent & { currentTarget: HTMLElement }) {
    const tabs = event.currentTarget;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || tabs.scrollWidth <= tabs.clientWidth) return;
    const unit = event.deltaMode === 1 ? parseFloat(getComputedStyle(tabs).fontSize) * 1.5
      : event.deltaMode === 2 ? tabs.clientWidth : 1;
    tabs.scrollLeft += event.deltaY * unit;
    event.preventDefault();
  }

  function tabKeydown(event: KeyboardEvent, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || tabsDisabled) return;
    const next = event.key === "Home" ? 0 : event.key === "End" ? SETTINGS_TABS.length - 1
      : event.key === "ArrowRight" ? (index + 1) % SETTINGS_TABS.length
      : event.key === "ArrowLeft" ? (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length : undefined;
    if (next === undefined) return;
    event.preventDefault();
    tab = SETTINGS_TABS[next]!.id;
    void tick().then(() => {
      const button = document.getElementById(`settings-tab-${tab}`);
      button?.focus({ preventScroll: true });
      button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
</script>

<Sheet.Pane bind:open docked {width} label="Settings pane">
  {#snippet divider(moving: boolean)}
    <WidthDivider edge="left" label="Resize Settings pane" minimum={Math.min(320, maximumWidth)} maximum={maximumWidth}
      disabled={resizeDisabled || moving} onstart={onresizestart} onpreview={onresizepreview} onend={onresizeend}/>
  {/snippet}
  <div class="settings-panel" data-settings-panel data-layout="docked" inert={!open}>
    <header class="settings-header"><MaterialIcon name="tune" size={16}/><h2 tabindex="-1" data-pane-heading>Settings</h2><MaterialIcon name="east" size={16}/>{@render header()}</header>
    <div class="settings-toolbar">
      {@render toolbar()}
      <div class="settings-close"><Button variant="ghost" size="icon-sm" aria-label="Close Settings" tooltip="Close Settings" onclick={() => open = false}><MaterialIcon name="close" size={18}/></Button></div>
    </div>
    <nav class="view-tabs tab-scroll" data-hover="foreground" aria-label="Settings view" onwheel={scrollTabs}>
      <div class="settings-tab-list" role="tablist" aria-label="Settings sections" aria-orientation="horizontal">
        {#each SETTINGS_TABS as item, index}
          <Button class="view-tab settings-tab" variant="ghost" role="tab" id={`settings-tab-${item.id}`} data-value={item.id}
            aria-selected={tab === item.id} aria-controls={`settings-section-${item.id}`} tabindex={tab === item.id ? 0 : -1}
            disabled={tabsDisabled} onclick={() => tab = item.id} onkeydown={event => tabKeydown(event, index)}>
            <MaterialIcon name={item.icon} size={15}/><span>{item.label}</span>
          </Button>
        {/each}
      </div>
    </nav>
    {#if open}{@render children()}{/if}
  </div>
</Sheet.Pane>

<style>
  .settings-panel { container:settings-pane / inline-size; display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; border-left:2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); background:var(--color-background); color:var(--color-foreground); }
  .settings-header { display:flex; align-items:center; gap:9px; height:var(--workbench-header-height, 48px); flex:0 0 var(--workbench-header-height, 48px); padding:6px 12px 6px calc(var(--tab-icon-center, calc(14px + .46875rem)) - .5rem); }
  h2 { margin:0; font-size:.6875rem; font-weight:700; }
  .settings-toolbar { display:flex; align-items:center; gap:2px; height:40px; flex:0 0 40px; padding:4px calc(var(--tab-icon-center, calc(14px + .46875rem)) - 1rem); background:var(--color-toolbar-background); color:var(--color-toolbar-foreground); }
  .settings-close { margin-left:auto; }
  .settings-tab-list { display:flex; min-width:max-content; }
  .settings-tab-list :global(.settings-tab) { display:flex; align-items:center; }
  .settings-tab-list :global(.settings-tab[aria-selected="true"]) { background:var(--color-background); }
  .settings-tab-list :global(.settings-tab:focus-visible) { background:var(--color-focus-background); color:var(--color-focus-foreground); }
</style>
