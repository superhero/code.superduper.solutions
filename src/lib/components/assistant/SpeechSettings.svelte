<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import SpeechModel from './SpeechModel.svelte';
  import { speech } from '$lib/assistant/speech/controller';
  import { speechModes } from '$lib/assistant/speech/catalog';
  onMount(() => { void speech.refresh(); });
</script>
<section class="speech-settings" aria-label="Speech input settings">
  <h4 tabindex="-1"><MaterialIcon name="mic" size={20} />Speech input</h4>
  {#each speechModes as mode (mode.id)}<SpeechModel mode={mode.id} />{/each}
</section>
<style>
  .speech-settings{display:grid;gap:12px;min-width:0;flex-shrink:0;padding:var(--pane-padding);background:var(--color-surface);border-radius:4px;font-size:.6875rem}
  h4{display:flex;align-items:center;gap:8px;margin:0;font-size:.75rem;font-weight:700}
</style>
