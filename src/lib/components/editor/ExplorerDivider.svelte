<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import WidthDivider from './WidthDivider.svelte';
  let {disabled=false,maximum=600,onstart,onpreview,onend}:
    {disabled?:boolean;maximum?:number;onstart():void;onpreview(width:number):void;onend(width:number|undefined):void}=$props();
  let viewportWidth=$state(0);
</script>
<svelte:window bind:innerWidth={viewportWidth}/>
<WidthDivider label="Resize repository explorer" minimum={Math.min(160,maximum)} maximum={Math.max(0,Math.min(maximum,viewportWidth-160))} {disabled} {onstart} {onpreview} {onend}/>
