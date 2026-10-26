<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";
  let { ref = $bindable(null), class: className, children, ...restProps }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div bind:this={ref} data-slot="dialog-header" class={cn("dialog-header", className)} {...restProps}>
  {@render children?.()}
</div>

<style>
  :global(.dialog-header) { display:flex; flex:none; flex-direction:column; gap:8px; padding-inline-end:32px; }
  :global(.dialog-header [data-dialog-title]) { margin:0; font-size:1rem; font-weight:650; line-height:1.4; }
  :global(.dialog-header [data-dialog-description]) { margin:0; font-size:.75rem; line-height:1.6; opacity:.75; }
</style>
