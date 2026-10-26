<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import * as Sheet from "$lib/components/ui/sheet";
  import { Button } from "$lib/components/ui/button";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import WidthDivider from "$lib/components/editor/WidthDivider.svelte";
  import VaultPage from "./VaultPage.svelte";

  let { open = $bindable(false), width, maximumWidth, resizeDisabled = false,
    onresizestart, onresizepreview, onresizeend, onchange }:
    { open?: boolean; width: number; maximumWidth: number; resizeDisabled?: boolean;
      onresizestart(): void; onresizepreview(width: number): void;
      onresizeend(width: number | undefined): void; onchange(): void } = $props();
</script>

<Sheet.Pane bind:open docked {width} label="Vault pane">
  {#snippet divider(moving: boolean)}
    <WidthDivider edge="left" label="Resize Vault pane" minimum={Math.min(320, maximumWidth)} maximum={maximumWidth}
      disabled={resizeDisabled || moving} onstart={onresizestart} onpreview={onresizepreview} onend={onresizeend}/>
  {/snippet}
  <div class="vault-panel" data-vault-panel data-layout="docked" inert={!open}>
    <header class="vault-header"><MaterialIcon name="shield_locked" size={16}/><h2 tabindex="-1" data-pane-heading>Vault</h2></header>
    <div class="vault-toolbar"><Button variant="ghost" size="icon-sm" aria-label="Close Vault" tooltip="Close Vault" onclick={() => open = false}><MaterialIcon name="close" size={18}/></Button></div>
    <nav class="view-tabs tab-scroll" aria-label="Vault view"><span class="view-tab vault-tab" aria-current="page"><MaterialIcon name="key" size={15}/><span>Values</span></span></nav>
    {#if open}<VaultPage embedded {onchange}/>{/if}
  </div>
</Sheet.Pane>

<style>
  .vault-panel { container:vault-pane / inline-size; display:flex; flex-direction:column; min-width:0; min-height:0; height:100%; border-left:2px solid color-mix(in srgb, var(--color-surface) 20%, var(--color-background)); background:var(--color-background); color:var(--color-foreground); }
  .vault-header { display:flex; align-items:center; gap:9px; height:var(--workbench-header-height, 48px); flex:0 0 var(--workbench-header-height, 48px); padding:6px 12px 6px calc(var(--tab-icon-center, calc(14px + .46875rem)) - .5rem); }
  h2 { margin:0; font-size:.6875rem; font-weight:700; }
  .vault-toolbar { display:flex; align-items:center; justify-content:flex-end; height:40px; flex:0 0 40px; padding:4px calc(var(--tab-icon-center, calc(14px + .46875rem)) - 1rem) 4px 12px; background:var(--color-toolbar-background); color:var(--color-toolbar-foreground); }
  .vault-tab { display:flex; align-items:center; background:var(--color-background); }
</style>
