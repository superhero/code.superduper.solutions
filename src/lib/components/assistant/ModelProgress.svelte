<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import type { Progress } from '$lib/assistant/browser/types';
  let { progress, label = 'Model loading', active = true }: { progress?: Progress | undefined; label?: string; active?: boolean } = $props();
  const percentage = $derived(progress?.total && progress.received !== undefined
    ? Math.min(100, Math.max(0, progress.received / progress.total * 100)) : undefined);
  const indeterminate = $derived(active && (percentage === undefined || percentage === 0));
</script>
<div class="model-progress" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100"
  aria-valuenow={indeterminate ? undefined : percentage ?? 100} data-indeterminate={indeterminate}>
  <span class:indeterminate style:transform={indeterminate ? undefined : `scaleX(${(percentage ?? 100) / 100})`}></span>
</div>
<style>
  .model-progress { width:100%; height:6px; overflow:hidden; border-radius:4px; background:var(--color-surface); }
  span { display:block; width:100%; height:100%; background:var(--color-foreground); transform-origin:left center; transition:transform 180ms linear; will-change:transform; }
  .indeterminate { width:35%; animation:model-progress-slide 1.2s ease-in-out infinite; transition:none; }
  @keyframes model-progress-slide { from { transform:translateX(-110%); } to { transform:translateX(300%); } }
  @media (prefers-reduced-motion:reduce) {
    span { transition:none; }
    .indeterminate { animation:none; transform:translateX(90%); }
  }
</style>
