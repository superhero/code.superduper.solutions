<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import ModelProgress from './ModelProgress.svelte';
  import type { Progress } from '$lib/assistant/browser/types';
  let { label, icon, active = false, progress, progressLabel = 'Model loading', detail = '' }:
    { label: string; icon: string; active?: boolean; progress?: Progress | undefined; progressLabel?: string; detail?: string } = $props();
  const bytes = (value: number) => `${(value / 1e9).toFixed(2)} GB`;
  const percentage = $derived(progress?.total ? Math.min(100, Math.max(0, Math.round((progress.received ?? 0) / progress.total * 100))) : undefined);
</script>

<div class="operation" role="status" aria-atomic="true">
  <strong class="operation-heading"><MaterialIcon name={icon} size={17} />{label}</strong>
  {#if active || progress?.total}<ModelProgress {progress} {active} label={progressLabel} />{/if}
  {#if progress?.total && progress.received !== undefined}
    <div class="transfer-amount"><span>{#if progress.unit === 'tensors'}{progress.received.toLocaleString()} / {progress.total.toLocaleString()} tensors{:else}{bytes(progress.received)} / {bytes(progress.total)}{/if}</span><strong>{percentage}%</strong></div>
  {/if}
  {#if detail}<p class="operation-detail">{detail}</p>{/if}
</div>

<style>
  .operation { display:grid; gap:10px; min-width:0; padding:var(--pane-padding); border-block-start:1px solid var(--color-surface); background:var(--color-background); }
  .operation-heading { display:flex; align-items:center; gap:8px; min-height:24px; margin:0; font-size:.6875rem; font-weight:600; line-height:1.5; }
  .transfer-amount { display:flex; align-items:baseline; justify-content:space-between; gap:12px; font-size:.625rem; font-variant-numeric:tabular-nums; }
  .transfer-amount strong { font-weight:600; }
  .operation-detail { margin:0; font-size:.625rem; line-height:1.6; overflow-wrap:anywhere; color:color-mix(in srgb, var(--color-foreground) 75%, var(--color-background)); }
</style>
