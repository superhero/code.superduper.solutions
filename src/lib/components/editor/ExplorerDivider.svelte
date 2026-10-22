<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import WidthDivider from './WidthDivider.svelte';
  let {disabled=false,onstart,onpreview,onend}:
    {disabled?:boolean;onstart():void;onpreview(width:number):void;onend(width:number|undefined):void}=$props();
  let viewportWidth=$state(0);
</script>
<svelte:window bind:innerWidth={viewportWidth}/>
<WidthDivider label="Resize repository explorer" minimum={160} maximum={Math.max(160,Math.min(600,viewportWidth-240))} {disabled} {onstart} {onpreview} {onend}/>
