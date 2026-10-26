<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Button } from '$lib/components/ui/button';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import ModelOperation from './ModelOperation.svelte';
  import { speech } from '$lib/assistant/speech/controller';
  import { speechArtifacts, speechModes, speechPins, tenRevision } from '$lib/assistant/speech/catalog';
  import { probeBrowser } from '$lib/assistant/browser/reference/compatibility.js';
  import type { BrowserFacts } from '$lib/assistant/browser/types';
  import type { SpeechMode } from '$lib/assistant/speech/types';
  import { speechNotices } from '$lib/assistant/speech/notices';
  let { mode }: { mode: SpeechMode } = $props();
  let status = $state(speech.state);
  const current = $derived(status.mode === mode);
  const variant = $derived(speechModes.find(item => item.id === mode)!);
  let failure = $state(''), notices = $state<{name?: string; title?: string; text: string}[]>([]);
  let settingsOpen = $state(false), compatibilityOpen = $state(false), infoOpen = $state(false), foldDuration = $state(0);
  let facts = $state<BrowserFacts>(), probing = $state(false);
  const installed = $derived(status.installed.includes(mode));
  const working = $derived(['installing', 'removing', 'loading', 'permission', 'recording', 'stopping'].includes(status.phase));
  const preparing = $derived(current && ['installing', 'loading', 'removing'].includes(status.phase));
  const precision = $derived(mode === 'cpu' ? 'INT8' : mode === 'gpu-fp16' ? 'FP16' : 'FP32');
  const downloadSize = $derived(speechArtifacts(mode).reduce((total, file) => total + file.bytes, 0));
  const compatibility = $derived(facts ? [
    { title: 'Secure page', passed: facts.secure, detail: 'HTTPS or localhost is required.' },
    { title: 'Cross-origin isolation', passed: facts.isolated, detail: 'The page must supply COOP/COEP headers.' },
    { title: 'WebAssembly SIMD', passed: facts.wasm && facts.simd, detail: 'Required by the CPU decoder and speech detector.' },
    { title: 'Microphone and audio worklets', passed: !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined', detail: 'Microphone permission is requested when you start dictation.' },
    ...(mode === 'cpu' ? [] : [{ title: 'WebGPU compute', passed: facts.gpu.compute, detail: 'Required by the GPU encoder. The decoder runs on the CPU.' }]),
    ...(mode === 'gpu-fp16' ? [{ title: 'FP16 compute', passed: facts.gpu.f16_compute, detail: 'Experimental FP16 requires shader-f16.' }] : []),
  ] : []);
  onMount(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => foldDuration = motion.matches ? 0 : 140;
    updateMotion(); motion.addEventListener('change', updateMotion);
    const unsubscribe = speech.subscribe(value => status = value);
    return () => { unsubscribe(); motion.removeEventListener('change', updateMotion); };
  });
  async function act(action: 'install' | 'load' | 'remove') {
    if (working) return;
    if (!current) speech.setMode(mode);
    if (action === 'install') await speech.install();
    if (action === 'load') await speech.initialize();
    if (action === 'remove') await speech.remove();
  }
  async function readNotices() {
    try {
      notices = (await speechNotices()).filter(notice => !['LICENSE', 'LICENSE-ADDITIONAL-TERMS'].includes(notice.name));
    } catch (error) { failure = String(error); }
  }
  async function check() {
    probing = true;
    try { facts = await probeBrowser(); }
    catch (error) { failure = String(error); }
    finally { probing = false; }
  }
</script>
<section class="model-unit" aria-label={`Parakeet TDT · 0.6B v3 · ${variant.label}`} data-speech-mode={mode} data-selected={current} data-hover="foreground">
    <div class="model-row">
      <span class="model-name" title="Parakeet TDT v3 · ONNX Runtime Web">Parakeet TDT v3</span>
      <span class="model-parameters" title="Parameter size">0.6B</span>
      <span class="model-quantization" title="Encoder precision">{precision}</span>
      <div class="model-controls">
      <span class="model-size" title="Download size">{(downloadSize / 1e9).toFixed(2)} GB</span>
      <div class="model-actions">
        {#if current && ['installing', 'loading'].includes(status.phase)}
          <Button variant="ghost" size="icon" tooltip="Cancel" aria-label="Cancel" onclick={() => speech.unload()}><MaterialIcon name="close" size={18} /></Button>
        {:else if installed}
          <span class="sr-only">{current && status.phase === 'ready' ? 'Loaded' : 'Installed'}</span>
          {#if current && status.phase === 'ready'}<Button variant="ghost" size="icon" tooltip="Unload model" aria-label="Unload speech model" onclick={() => speech.unload()}><MaterialIcon name="eject" size={18} /></Button>
          {:else}<Button variant="ghost" size="icon" tooltip={current && status.phase === 'failed' ? 'Retry speech startup' : 'Load model'} aria-label={current && status.phase === 'failed' ? 'Retry speech startup' : 'Load speech model'} disabled={working} onclick={() => void act('load')}><MaterialIcon name="play_arrow" size={18} /></Button>{/if}
          <Button variant="ghost" size="icon" tooltip="Remove model" aria-label="Remove speech model" disabled={working} onclick={() => void act('remove')}><MaterialIcon name="delete" size={18} /></Button>
        {:else}<Button variant="ghost" size="icon" tooltip="Install speech model" aria-label="Install speech model" disabled={working} onclick={() => void act('install')}><MaterialIcon name="install_desktop" size={18} /></Button>{/if}
        <Button variant="ghost" size="icon" tooltip="Browser compatibility" aria-label="Browser compatibility" aria-expanded={compatibilityOpen} aria-controls={`speech-${mode}-compatibility`} onclick={() => compatibilityOpen = !compatibilityOpen}><MaterialIcon name="speed" size={18} /></Button>
        <Button variant="ghost" size="icon" tooltip="Model settings" aria-label="Model settings" aria-expanded={settingsOpen} aria-controls={`speech-${mode}-model-settings`} onclick={() => settingsOpen = !settingsOpen}><MaterialIcon name="tune" size={18} /></Button>
        <Button variant="ghost" size="icon" tooltip="Detailed info" aria-label="Detailed info" aria-expanded={infoOpen} aria-controls={`speech-${mode}-model-info`} onclick={() => { infoOpen = !infoOpen; if (infoOpen && !notices.length) void readNotices(); }}><MaterialIcon name="info" size={18} /></Button>
      </div>
      </div>
    </div>
    {#if current && status.stage && status.phase !== 'failed'}
      <ModelOperation label={status.stage} icon={preparing ? status.phase === 'installing' ? 'downloading' : 'hourglass_top' : ['permission','recording','stopping'].includes(status.phase) ? 'mic' : 'check_circle'} active={preparing} progress={status.progress ? {message:status.stage, ...status.progress} : undefined} progressLabel={status.phase === 'installing' ? 'Speech model download' : 'Speech model loading'} detail={status.phase === 'loading' ? 'Startup can take up to 120 seconds.' : ''} />
    {/if}
    {#if current && status.error || failure}<div role="alert" class="failure"><MaterialIcon name="error" size={17} /><p>{current && status.error || failure}</p></div>{/if}
    {#if compatibilityOpen}<div class="fold-panel" id={`speech-${mode}-compatibility`} role="region" aria-label="Browser compatibility" transition:slide={{ duration: foldDuration }}>
      <h5>Browser compatibility</h5>
      <div class="disclosure-content">
        <div class="check-actions"><p>Check support before loading.</p><Button variant="secondary" size="sm" disabled={probing} onclick={() => void check()}><MaterialIcon name="refresh" size={15} />{probing ? 'Checking…' : 'Check this browser'}</Button></div>
        {#if facts}
          <p>{compatibility.every(row => row.passed) ? 'Browser checks passed. Model memory fit is checked during loading.' : 'Required checks are missing. See the explanations below.'}</p>
          <ul class="compatibility-list">{#each compatibility as row}<li><MaterialIcon name={row.passed ? 'check_circle' : 'error'} size={16} /><div><strong>{row.title}</strong><p>{row.detail}</p></div></li>{/each}</ul>
        {/if}
        {#if mode === 'gpu-fp16'}<p class="warning">FP16 is experimental. Startup and transcription may fail on this browser.</p>{/if}
      </div>
    </div>{/if}
    {#if settingsOpen}<div class="fold-panel" id={`speech-${mode}-model-settings`} role="region" aria-label="Model settings" transition:slide={{ duration: foldDuration }}>
      <div class="disclosure-content">
        <dl><dt>Execution</dt><dd>{mode === 'cpu' ? 'CPU' : 'WebGPU'}</dd><dt>Encoder</dt><dd>{precision}</dd><dt>Decoder</dt><dd>CPU · INT8</dd></dl>
        {#if mode === 'gpu-fp16'}<p class="warning">FP16 is experimental. Startup and transcription may fail on this browser.</p>{/if}
      </div>
    </div>{/if}
    {#if infoOpen}<div class="fold-panel" id={`speech-${mode}-model-info`} role="region" aria-label="Detailed info" transition:slide={{ duration: foldDuration }}>
      <h5>Detailed info</h5>
      <div class="disclosure-content">
    <p>Dictate into your AI draft. Audio is processed in memory and is never saved as a recording.</p>
    <p>{variant.description}. Storage size does not measure free RAM or GPU memory.</p>
    <dl><dt>Model</dt><dd><a href={`https://huggingface.co/${speechPins.publisherModel}/tree/${speechPins.publisherRevision}`} target="_blank" rel="noreferrer">NVIDIA Parakeet · CC BY 4.0</a></dd>
      <dt>ONNX conversion</dt><dd><a href={`https://huggingface.co/${speechPins.browserArtifact}/tree/${speechPins.revision}`} target="_blank" rel="noreferrer">ysdede · maintainer conversion</a></dd>
      <dt>Runtime</dt><dd>parakeet.js 1.4.4 · ONNX Runtime 1.30.0 · serial session initialization</dd>
      <dt>Speech detection</dt><dd>Powered by TEN-VAD · {tenRevision.slice(0, 12)}</dd></dl>
    <p>Downloads are optional. TEN-VAD has additional license conditions, including restrictions involving Agora’s offerings. Its unchanged engine is downloaded directly from the publisher.</p>
    <p>Weights © NVIDIA, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. ONNX conversion and quantization by ysdede. The selected precision changes the converted artifacts.</p>
    {#each notices as notice}<details><summary>{notice.name ?? notice.title}</summary><pre>{notice.text}</pre></details>{/each}
    <p><a href="https://github.com/ysdede/parakeet.js/blob/v1.4.4/LICENSE" target="_blank" rel="noreferrer">parakeet.js license</a> · <a href="https://github.com/microsoft/onnxruntime/blob/v1.30.0/LICENSE" target="_blank" rel="noreferrer">ONNX Runtime license</a></p>
      </div>
    </div>{/if}
</section>
<style>
  .model-unit{font-size:.6875rem;container-type:inline-size;min-width:0;border-radius:4px;overflow:hidden;background:var(--color-background)}
  .model-row{display:grid;grid-template-columns:minmax(90px,140px) 40px 64px 76px minmax(0,1fr);align-items:stretch;min-width:0}
  .model-controls{display:contents}
  .model-name,.model-parameters,.model-quantization,.model-size{display:flex;align-items:center;min-height:36px;padding:0 8px;min-width:0;white-space:nowrap}
  .model-name{font-weight:650;overflow:hidden}
  .model-parameters,.model-quantization,.model-size{justify-content:center;border-inline-start:1px solid var(--color-surface)}
  .model-quantization,.model-size{font-size:.625rem;font-variant-numeric:tabular-nums}
  .model-actions{display:flex;justify-content:flex-end;align-items:center;gap:0;min-width:0}
  .model-actions :global(button[data-slot="button"]){flex:0 0 36px;width:36px;padding:0;border-radius:0;border-inline-start:1px solid var(--color-surface)}
  .model-actions :global(button[aria-expanded="true"]){color:var(--color-toolbar-background)}
  .fold-panel{padding:var(--pane-padding);background:var(--color-surface);border-inline:2px solid var(--color-background);border-bottom:2px solid var(--color-background)}
  .fold-panel>h5{margin:0 0 8px;font-size:.6875rem;font-weight:650}
  .disclosure-content{display:grid;gap:12px;min-width:0}
  .check-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .compatibility-list{display:grid;gap:10px;margin:0;padding:0;list-style:none}
  .compatibility-list li{display:grid;grid-template-columns:16px minmax(0,1fr);gap:8px}
  @container settings-pane (max-width:550px){
    .model-row{grid-template-columns:minmax(0,1fr) 40px 64px}
    .model-controls{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:stretch;border-block-start:1px solid var(--color-surface)}
    .model-size{flex:1 0 auto;justify-content:flex-start;border-inline-start:0}
    .model-actions{flex:0 0 auto;margin-inline-start:auto}
  }
  p{margin:0;line-height:1.6;opacity:.8}strong{font-weight:600}summary{cursor:pointer;padding-block:6px;font-weight:600}details{min-width:0}details>pre{margin-top:10px}
  .failure{display:grid;grid-template-columns:17px minmax(0,1fr);gap:8px;padding:var(--pane-padding);border-block-start:1px solid var(--color-surface);background:var(--color-error-background);color:var(--color-error-foreground);white-space:pre-wrap}.failure>p{opacity:1}.warning{color:var(--color-primary)}
  dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;margin-block:10px}dt{opacity:.6}dd{margin:0;overflow-wrap:anywhere}a{color:inherit;text-underline-offset:3px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;max-height:220px;overflow:auto;padding:10px;background:var(--color-background);border-radius:4px}
</style>
