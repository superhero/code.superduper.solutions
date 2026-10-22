<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import glyphs from "../../assets/fonts/devicon-glyphs.json";
  import type { Provider } from "$lib/remotes/types";
  let { provider, size = 20 }: { provider: Provider; size?: number } = $props();
  const names = { github: "github-original", gitlab: "gitlab-plain", bitbucket: "bitbucket-original" } as const;
</script>
<span class="provider-icon" style:font-size={`${size / 16}rem`} aria-hidden="true">{glyphs[names[provider]]}</span>
<style>
  .provider-icon{display:inline-block;flex-shrink:0;width:1em;height:1em;font-family:Devicon;font-weight:400;font-style:normal;font-synthesis:none;line-height:1;letter-spacing:normal;text-transform:none;text-align:center;user-select:none}
</style>
