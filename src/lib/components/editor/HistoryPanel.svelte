<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import ChangeGraph from "./ChangeGraph.svelte";
  import PageMinimap from "./PageMinimap.svelte";
  import WidthDivider from "./WidthDivider.svelte";
  import type { RepositorySnapshot } from "$lib/repository/client";
  import type { EditorSettings } from "$lib/editor/settings";
  import type { HistoryView } from "$lib/editor/workspace";
  let { open = $bindable(false), panel = $bindable(), graph = $bindable(), docked, width, maximumWidth, resizeDisabled,
    repository, settings, view, disabled, frozen=false, onviewchange, onselectchange, onselectcommit, onscroll,
    onresizestart, onresizepreview, onresizeend }:
    { open?: boolean; panel?: HTMLDivElement | undefined; graph?: { revealCurrent(panel: HTMLElement): void } | undefined; docked: boolean;
      width: number; maximumWidth: number; resizeDisabled: boolean; repository: RepositorySnapshot;
      settings: EditorSettings; view: HistoryView; disabled: boolean; frozen?:boolean; onviewchange(view: HistoryView): void;
      onselectchange(oid: string): void; onselectcommit(oid: string): void; onscroll(panel: HTMLDivElement): void;
      onresizestart(): void; onresizepreview(width: number): void; onresizeend(width: number | undefined): void } = $props();
</script>

<Sheet.Pane bind:open {docked} {width} label={`History · ${repository.name}`}>
  {#snippet divider(moving: boolean)}<WidthDivider edge="left" label="Resize History pane" minimum={320} maximum={maximumWidth}
    disabled={resizeDisabled || frozen || moving} onstart={onresizestart} onpreview={onresizepreview} onend={onresizeend}/>{/snippet}
  <div class="history-pane" inert={frozen} data-history-panel data-layout={docked ? "docked" : "overlay"}>
    <header>
      <div class="title"><MaterialIcon name="history" size={16}/><h2 tabindex="-1" data-pane-heading>History</h2></div>
    </header>
    <div class="history-actions">
      <Button variant="ghost" size="icon-sm" aria-label="Close History" tooltip="Close History pane" onclick={() => open = false}><MaterialIcon name="close" size={18}/></Button>
    </div>
    <nav class="history-tabs" aria-label="History views">
      <Button class="history-tab" variant="ghost" aria-pressed={view === "changes"} {disabled} onclick={() => onviewchange("changes")}>
        <MaterialIcon name="manage_history" size={16}/><span>Staged changes</span>
      </Button>
      <Button class="history-tab" variant="ghost" aria-pressed={view === "versions"} {disabled} onclick={() => onviewchange("versions")}>
        <MaterialIcon name="commit" size={16}/><span>Commit history</span>
      </Button>
    </nav>
    <div class="page-with-minimap" class:hide-scrollbars={!settings.scrollbars}>
      <div bind:this={panel} id="panel-history" role="region" tabindex="-1" aria-label="History" class="scroll-panel" onscroll={event => onscroll(event.currentTarget)}>
        <div class="history-page">
          {#key repository.id}
          <section hidden={view !== "changes"}><ChangeGraph bind:this={graph} includeFuture versions={repository.history} current={repository.historyHead}
            emptyMessage={repository.head ? "No changes for this commit." : "No changes yet."} onselect={onselectchange} {disabled}/></section>
          <section hidden={view !== "versions"}><ChangeGraph versions={repository.commits} current={repository.head} label="Commit history"
            emptyMessage="No commits yet." selectLabel="Inspect commit" onselect={onselectcommit} {disabled}/></section>
          {/key}
        </div>
      </div>
      {#if settings.minimap}<PageMinimap target={panel} label="History"/>{/if}
    </div>
  </div>
</Sheet.Pane>

<style>
  .history-pane { --history-divider:color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); display:flex; flex-direction:column; height:100%; min-width:0; min-height:0; background:var(--color-background); color:var(--color-foreground); font-size:.75rem; }
  .history-pane[data-layout="docked"] { border-left:2px solid var(--history-divider); }
  header { display:flex; align-items:center; justify-content:space-between; height:var(--workbench-header-height, 48px); flex:0 0 var(--workbench-header-height, 48px); min-height:0; gap:12px; padding:6px 12px; }
  .title { display:flex; align-items:center; gap:8px; }
  h2 { font-size:0.75rem; font-weight:600; margin:0; outline:none; }
  .history-actions { display:flex; align-items:center; gap:2px; justify-content:flex-end; padding:4px 12px; height:40px; flex:0 0 40px; background:var(--color-toolbar-background); color:var(--color-toolbar-foreground); }
  .history-actions :global(button) { --color-hover-background:color-mix(in srgb, var(--color-foreground) 50%, transparent); }
  .history-actions :global(button:disabled) { background:transparent; color:color-mix(in srgb, var(--color-surface) 65%, transparent); }
  .history-tabs { display:flex; min-width:0; height:var(--workbench-tabs-height, 40px); flex:0 0 var(--workbench-tabs-height, 40px); background:var(--color-surface); border-block:2px solid var(--history-divider); overflow-x:auto; scrollbar-width:none; }
  .history-tabs :global(.history-tab) { flex:1 0 auto; justify-content:flex-start; height:var(--workbench-tabs-content-height, 36px); padding:6px 12px; border-radius:0; background:var(--color-hover-background); font-size:.625rem; gap:6px; }
  .history-tabs :global(.history-tab[aria-pressed="true"]) { background:var(--color-background); }
  .history-tabs::-webkit-scrollbar { display:none; }
  .page-with-minimap { --page-minimap-width:clamp(24px,4vw,60px); position:relative; display:flex; flex:1; min-height:0; min-width:0; }
  .scroll-panel { position:relative; flex:1; min-height:0; min-width:0; overflow:auto; }
  .history-page { padding:12px 0 40px; }
  section { min-width:0; }
  .hide-scrollbars .scroll-panel { scrollbar-width:none; }
  .hide-scrollbars .scroll-panel::-webkit-scrollbar { display:none; }
</style>
