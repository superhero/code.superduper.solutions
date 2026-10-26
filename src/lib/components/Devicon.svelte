<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import glyphs from "../../assets/fonts/devicon-glyphs.json" with { type: "json" };

  let { name, size = 16 }: { name: keyof typeof glyphs; size?: number } = $props();
</script>

<span class="devicon" data-devicon={name} style:font-size={`${size / 16}rem`} aria-hidden="true">{glyphs[name]}</span>

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
  }
</style>
