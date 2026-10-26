<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import WidthDivider from "$lib/components/editor/WidthDivider.svelte";
  import type { RepositorySnapshot } from "$lib/repository/types";
  import type { ResourceSample } from "$lib/resources/browser";
  import ResourcesPage from "./ResourcesPage.svelte";

  let { open = $bindable(false), panel = $bindable<HTMLDivElement>(), width, maximumWidth,
    repository, repositoryCount, scrollTop = 0, resizeDisabled = false,
    onresizestart, onresizepreview, onresizeend, onscroll }:
    { open?: boolean; panel?: HTMLDivElement | undefined; width: number; maximumWidth: number;
      repository: RepositorySnapshot | null; repositoryCount: number; scrollTop?: number; resizeDisabled?: boolean;
      onresizestart(): void; onresizepreview(width: number): void;
      onresizeend(width: number | undefined): void; onscroll(panel: HTMLDivElement): void } = $props();
  // Measurements survive closing this pane only for the current browser session.
  let samples = $state.raw<ResourceSample[]>([]);
  let resourcesPage: ResourcesPage | undefined = $state();
  let paused = $state(false), refreshing = $state(false);
  function restoreScroll(node: HTMLDivElement, top: number) { node.scrollTop = top; }
</script>

<Sheet.Pane bind:open docked {width} label="Resources pane">
  {#snippet divider(moving: boolean)}
    <WidthDivider edge="left" label="Resize Resources pane" minimum={Math.min(320, maximumWidth)} maximum={maximumWidth}
      disabled={resizeDisabled || moving} onstart={onresizestart} onpreview={onresizepreview} onend={onresizeend}/>
  {/snippet}
  <div class="resources-panel" data-resources-panel data-layout="docked" inert={!open}>
    <header class="resources-header"><MaterialIcon name="monitoring" size={16}/><h2 tabindex="-1" data-pane-heading>Resources</h2></header>
    <div class="resources-toolbar">
      <div class="resources-actions">
        <Button variant="ghost" size="icon-sm" aria-label={paused ? "Resume monitoring" : "Pause monitoring"} tooltip={paused ? "Resume monitoring" : "Pause monitoring"} disabled={!resourcesPage} onclick={() => resourcesPage?.toggleMonitoring()}><MaterialIcon name={paused ? "play_arrow" : "pause"} size={18}/></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Refresh resources" tooltip="Refresh resources" disabled={!resourcesPage || refreshing} onclick={() => resourcesPage?.refresh()}><MaterialIcon name="refresh" size={18}/></Button>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Close Resources" tooltip="Close Resources" onclick={() => open = false}><MaterialIcon name="close" size={18}/></Button>
    </div>
    <nav class="view-tabs tab-scroll" aria-label="Resources view"><span class="view-tab resources-tab" aria-current="page"><MaterialIcon name="monitoring" size={15}/><span>Overview</span></span></nav>
    {#if open}
      <div class="resources-body" id="panel-resources" role="region" aria-label="Resources" tabindex="-1"
        bind:this={panel} use:restoreScroll={scrollTop} onscroll={event => onscroll(event.currentTarget)}>
        <ResourcesPage bind:this={resourcesPage} {repository} {repositoryCount} bind:samples bind:paused bind:refreshing/>
      </div>
    {/if}
  </div>
</Sheet.Pane>

<style>
  .resources-panel { container:resources-pane / inline-size; display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; border-left:2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); background:var(--color-background); color:var(--color-foreground); }
  .resources-header { display:flex; align-items:center; gap:9px; height:var(--workbench-header-height, 48px); flex:0 0 var(--workbench-header-height, 48px); padding:6px 12px 6px calc(var(--tab-icon-center, calc(14px + .46875rem)) - .5rem); }
  h2 { margin:0; font-size:.6875rem; font-weight:700; }
  .resources-toolbar { display:flex; align-items:center; justify-content:space-between; height:40px; flex:0 0 40px; padding:4px calc(var(--tab-icon-center, calc(14px + .46875rem)) - 1rem); background:var(--color-toolbar-background); color:var(--color-toolbar-foreground); }
  .resources-actions { display:flex; align-items:center; gap:2px; }
  .resources-tab { display:flex; align-items:center; background:var(--color-background); }
  .resources-body { flex:1; min-height:0; overflow:auto; }
</style>
