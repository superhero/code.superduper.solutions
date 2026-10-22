<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  let { level, last, directory, route }:
    { level: number; last: boolean; directory: boolean; route: "through" | "to" | undefined } = $props();
</script>

<span class="tree-guides" aria-hidden="true" class:last class:directory class:root={level === 1}
  class:route-through={route === "through"} class:route-to={route === "to"}
  style:--guide-left={level === 1 ? "calc(0.5rem - 0.5px)" : `calc(24.5px + 0.5rem + ${(level - 2) * 25}px)`}>
  <span class="stem"></span>
  {#if route}<span class="route-stem"></span>{/if}
  <span class="elbow"><span class="elbow-vertical"></span><span class="elbow-horizontal"></span></span>
</span>

<style>
  .tree-guides { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
  .stem, .route-stem { position: absolute; left: var(--guide-left); top: 0; bottom: 0;
    width: 1px; background: var(--color-tree-guide); }
  .last .stem, .last .route-stem, .route-to .route-stem { display: none; }
  .route-stem { background: var(--color-drop-foreground); }
  .elbow { position: absolute; left: var(--guide-left); top: 0; width: calc(19.5px - 0.5rem); height: calc(var(--tree-row-pitch) / 2 + .5px);
  }
  .elbow-vertical, .elbow-horizontal { position: absolute; left: 0; background-color: var(--color-tree-guide); }
  /* The full stem already draws this segment on non-final siblings. Avoid
     painting translucent guides twice along the stem and at the corner. */
  .elbow-vertical { display: none; top: 0; bottom: 0; width: 1px; }
  .last .elbow-vertical, .route-to .elbow-vertical { display: block; }
  .elbow-horizontal { left: 1px; bottom: 0; width: calc(100% - 1px); height: 1px; }
  .route-to .elbow-vertical, .route-to .elbow-horizontal { background-color: var(--color-drop-foreground); }
  .last .elbow {
    border-left: 1px solid var(--color-tree-guide);
    border-bottom: 1px solid var(--color-tree-guide);
    border-bottom-left-radius: 4px;
  }
  .last .elbow-vertical, .last .elbow-horizontal { display: none; }
  .last.route-to .elbow { border-color: var(--color-drop-foreground); }

</style>
