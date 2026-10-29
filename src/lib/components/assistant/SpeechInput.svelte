<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import ModelProgress from './ModelProgress.svelte';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import { speech } from '$lib/assistant/speech/controller';
  import { speechModes, speechArtifacts, lfmSpeechProfile, isBatchSpeech } from '$lib/assistant/speech/catalog';
  import type { SpeechMode } from '$lib/assistant/speech/types';
  let { owner, disabled = false, ontext, onactive }: { owner: string; disabled?: boolean; ontext: (text: string) => void; onactive: (active: boolean) => void } = $props();
  let status = $state(speech.state);
  let preparing = $state(false), queued = $state(false), failure = $state('');
  let disposed = false, request: AbortController | undefined;
  let choice = $state<SpeechMode>();
  const selected = $derived(speechModes.find(model => model.id === (choice ?? (status.installed.includes(status.mode) ? status.mode : status.installed[0] ?? status.mode)))!);
  const items = speechModes.map(model => ({value:model.id,label:model.label,icon:'mic'}));
  const mine = $derived(['permission','recording','stopping'].includes(status.phase) && speech.owner === owner);
  const recording = $derived(mine && status.phase === 'recording');
  const working = $derived(['permission','recording','stopping','loading','installing','removing'].includes(status.phase));
  const caption = $derived(mine ? status.phase === 'permission' ? 'Cancel microphone' : status.phase === 'stopping' ? 'Finishing…' : `Stop · ${status.seconds.toFixed(0)}s` : preparing ? queued ? 'Cancel queued load' : status.phase === 'installing' ? 'Cancel install' : 'Cancel loading' : 'Dictate');
  onMount(() => { void speech.refresh(); return speech.subscribe(value => { status = value; onactive(speech.owner === owner && ['permission','recording','stopping'].includes(value.phase)); }); });
  onDestroy(() => { disposed = true; request?.abort(); onactive(false); void speech.stop(owner); });
  function cancel() { request?.abort(); request = undefined; preparing = false; queued = false; }
  async function prepare(mode: SpeechMode, dictate = false) {
    cancel(); choice = mode; failure = ''; preparing = true; queued = true;
    const controller = request = new AbortController(), origin = owner;
    try {
      const { runBrowserTurn } = await import('$lib/assistant/browser/runtime');
      await runBrowserTurn(async (_load, unload) => { if (isBatchSpeech(mode)) await unload(); return speech.prepare(mode, controller.signal, () => { if (request === controller) queued = false; }); }, controller.signal);
      if (dictate && !disposed && !disabled && owner === origin && !controller.signal.aborted && speech.state.mode === mode && speech.state.phase === 'ready') void speech.record(origin, ontext);
    } catch (error) {
      if (!disposed && !controller.signal.aborted) failure = error instanceof Error ? error.message : 'Speech preparation failed.';
    } finally { if (request === controller) { request = undefined; preparing = false; queued = false; } }
  }
  function act() {
    if (mine) { void speech.stop(owner); return; }
    if (preparing) { cancel(); return; }
    if (!disabled && !working) void prepare(selected.id, true);
  }
</script>
<div class="speech-input">
  <div class="speech-tools">
    <Button variant="ghost" size="sm" class="dictate" disabled={(disabled || working) && !mine && !preparing || mine && status.phase === 'stopping'} aria-label={mine ? recording ? 'Stop dictation' : 'Speech input' : preparing ? 'Cancel speech loading' : 'Speech input'} aria-pressed={recording} onclick={act}><MaterialIcon name={recording ? 'stop_circle' : preparing && !mine ? 'close' : 'mic'} size={16} />{caption}</Button>
    <NavigationDropdown label="Speech model" side="top" value={selected.id} placeholder="Choose speech model" {items} {disabled} onchange={() => {}} onchoose={value => void prepare(value as SpeechMode)}>
      {#snippet itemLabel(item)}<span>{isBatchSpeech(item.value as SpeechMode) ? item.label : `Parakeet TDT v3 · ${item.label}`}</span><small>{status.mode === item.value && ['ready','permission','recording','stopping'].includes(status.phase) ? 'Loaded' : status.installed.includes(item.value as SpeechMode) ? 'Installed' : `Install · ${(speechArtifacts(item.value as SpeechMode).reduce((sum, file) => sum + file.bytes, 0) / 1e9).toFixed(2)} GB`}</small>{/snippet}
    </NavigationDropdown>
  </div>
  {#if preparing || mine || status.error || failure}<div class="speech-status" role={status.error || failure ? 'alert' : 'status'}>{failure || status.error || (queued ? 'Speech model queued after the current operation…' : status.stage)}
    {#if preparing && !queued && !status.error && !failure}<ModelProgress progress={status.progress ? {message:status.stage,...status.progress} : undefined} label="Speech preparation" />{/if}
    {#if mine && status.transcript}<span class="provisional">{status.transcript}</span>{/if}
  </div>{/if}
</div>
<style>
  .speech-input{display:contents}.speech-tools{display:flex;align-items:center;min-width:0;max-width:100%;height:32px}.speech-tools :global(button){font-size:.6875rem;font-weight:400;padding-inline:5px;height:100%}.speech-tools :global(.navigation-trigger){width:24px;justify-content:center;padding-inline:0;flex-shrink:0}.speech-tools :global(.navigation-label),.speech-tools :global(.navigation-trigger > .material-symbols-rounded:first-child){display:none}.speech-status{flex-basis:100%;padding:8px 0;font-size:.6875rem;line-height:1.5}.provisional{display:block;opacity:.65;margin-top:4px}
  small{display:block;font-size:.625rem;opacity:.7}
  .speech-status :global(.model-progress){margin-top:6px}
</style>
