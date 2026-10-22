<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { fileIcon } from "$lib/editor/file-icons";
  import MaterialIcon from "./MaterialIcon.svelte";

  let { path, size = 16 }: { path: string; size?: number } = $props();
  const icon = $derived(fileIcon(path));
</script>

{#if icon.kind === "devicon"}
  <span class="devicon" data-file-icon={icon.name} style:font-size={`${size / 16}rem`} aria-hidden="true">{icon.glyph}</span>
{:else}
  <MaterialIcon name={icon.name} {size} />
{/if}

<style>
  .devicon {
    display: inline-block;
    flex-shrink: 0;
    width: 1em;
    height: 1em;
    font-family: Devicon;
    font-weight: 400;
    font-style: normal;
    font-variant: normal;
    font-synthesis: none;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    text-align: center;
    direction: ltr;
    user-select: none;
    /* Keep glyph edges in the same layer as the icon when folder slides move it. */
    transform: translateZ(0);
  }
  .devicon[data-file-icon="javascript-plain"],
  .devicon[data-file-icon="typescript-plain"],
  .devicon[data-file-icon="npm-plain"],
  .devicon[data-file-icon="fortran-original"],
  .devicon[data-file-icon="wasm-original"] {
    transform: translateZ(0) scale(.875);
  }
</style>
