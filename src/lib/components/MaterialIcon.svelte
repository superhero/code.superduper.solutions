<!--
Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
-->

<script lang="ts">
  let { name, size, class: className }: { name: string; size?: number; class?: string } = $props();
</script>

<span class={["material-symbols-rounded", className]} style:font-size={size === undefined ? undefined : `${size / 16}rem`} aria-hidden="true">{name}</span>
