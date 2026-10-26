<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { slide } from 'svelte/transition';
  import { Button } from '$lib/components/ui/button';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import ModelOperation from './ModelOperation.svelte';
  import { profileById, downloadBytes } from '$lib/assistant/browser/catalog';
  import { installedModels, removeModel, subscribeModels, readModelSettings, saveModelSettings } from '$lib/assistant/browser/storage';
  import { installBrowserModel } from '$lib/assistant/browser/installer';
  import { defaultSettings, configuredProfile } from '$lib/assistant/browser/settings.js';
  import { probeBrowser, compatibilityFor } from '$lib/assistant/browser/compatibility.js';
  import { executionSettings, DEFAULT_EXECUTION, loadedModel, runtimeBusy, subscribeRuntime, loadBrowserModel, unloadBrowserModel } from '$lib/assistant/browser/runtime';
  import type { BrowserFacts, Progress } from '$lib/assistant/browser/types';
  type ModelAction = 'install' | 'remove' | 'load' | 'unload';
  let { modelId }: { modelId: string } = $props();
  const selected = $derived(modelId);
  let installed = $state<string[]>([]), active = $state<string>();
  let busy = $state(false), runtimeWorking = $state(false), failure = $state(''), progress = $state<Progress>();
  let operation = $state<ModelAction>('install');
  let generation = $state<Record<string, number | boolean | string>>({}), execution = $state({ ...DEFAULT_EXECUTION });
  let facts = $state<BrowserFacts>(), probing = $state(false), ready = $state(false), controller = $state<AbortController>();
  let epoch = 0;
  let pendingSettings = Promise.resolve();
  let settingsOpen = $state(false), infoOpen = $state(false), compatibilityOpen = $state(false), foldDuration = $state(0);
  const profile = $derived(profileById(selected));
  const engineLabel = $derived(({webml:'WebML',wllama:'Wllama','litert-lm':'LiteRT-LM',transformers:'Transformers.js','strands-onnx':'ONNX Runtime Web','wllama-knowline':'Wllama · KnowLine','wllama-elephant':'Wllama · Elephant','wllama-pplx':'Wllama · Perplexity'})[profile.engine]);
  const modelName = $derived(profile.engine === 'strands-onnx'
    ? `${profile.title.split(' · ')[0]} · ${profile.runtime_id === 'strands-cpu' ? 'CPU' : 'WebGPU'}`
    : profile.title.split(' · ')[0]);
  const parameterSize = $derived(profile.parameters ?? profile.title.match(/·\s*([\d.]+B)/)?.[1] ?? '—');
  const quantization = $derived(profile.quantization ?? profile.file.match(/(PTQ\d+_\d+|Q\d+_[A-Z0-9_]+)\.gguf$/i)?.[1] ?? '—');
  const compatibility = $derived(compatibilityFor(facts, profile, profile.engine === 'webml' ? 'gpu' : execution.mode));
  const bytes = (value: number) => `${(value / 1e9).toFixed(2)} GB`;
  const operationLabels: Record<ModelAction, [string, string]> = {
    install: ['Downloading model', 'Model installed'], load: ['Loading model', 'Model loaded'],
    remove: ['Removing model', 'Model removed'], unload: ['Unloading model', 'Model unloaded'],
  };
  const checkLabels: Record<string, string> = { pass: 'Passed', fail: 'Failed', warn: 'Limited', info: 'Info' };
  const checkIcons: Record<string, string> = { pass: 'check_circle', fail: 'error', warn: 'warning', info: 'info' };
  const labels: Record<string, string> = { context_tokens: 'Context tokens', max_new_tokens: 'Maximum output tokens', thinking: 'Reasoning',
    prefix_cache: 'Reuse prompt cache', image_max_pixels: 'Maximum image pixels', image_max_tokens: 'Vision token budget',
    context_shift: 'Shift context', cpu_threads: 'CPU threads', batch_tokens: 'Batch tokens', micro_batch_tokens: 'Micro batch tokens',
    flash_attention: 'Flash attention', cache_type_k: 'Key cache', cache_type_v: 'Value cache', load_timeout_ms: 'Load timeout (ms)',
    sampling_mode: 'Decoding', temperature: 'Temperature', top_k: 'Top K', top_p: 'Top P', min_p: 'Min P', seed: 'Seed',
    chat_timeout_ms: 'Request timeout (ms)', turn_timeout_ms: 'Response timeout (ms)', max_model_turns: 'Maximum model rounds', max_tool_calls: 'Maximum tool calls' };
  async function refresh() { installed = await installedModels(); active = loadedModel(); runtimeWorking = runtimeBusy(); }
  async function readSettings() {
    const request = ++epoch, id = selected; failure = ''; progress = undefined; ready = false;
    try {
      const saved = await readModelSettings(id);
      if (request !== epoch) return;
      generation = defaultSettings(profileById(id), saved.generation as Record<string, unknown> | undefined);
      execution = executionSettings(saved.execution, profileById(id)); ready = true;
    } catch (error) { failure = error instanceof Error ? error.message : 'Could not read model settings.'; }
  }
  async function check() {
    probing = true;
    try { facts = await probeBrowser(); }
    catch (error) { failure = error instanceof Error ? error.message : 'Browser checks failed.'; }
    finally { probing = false; }
  }
  function saveSettings() {
    try {
      const id = selected, settings = { generation: $state.snapshot(generation), execution: $state.snapshot(execution) };
      configuredProfile(profile, settings.generation); executionSettings(settings.execution, profile);
      if (profile.engine === 'webml' && !['auto','gpu'].includes(settings.execution.mode)) throw new Error('WebML supports GPU execution only.');
      failure = '';
      pendingSettings = pendingSettings.then(async () => {
        if (loadedModel() === id) await unloadBrowserModel();
        await saveModelSettings(id, settings);
      }).catch(error => { failure = error instanceof Error ? error.message : 'Could not save model settings.'; });
    } catch (error) { failure = error instanceof Error ? error.message : 'Invalid model settings.'; }
  }
  async function act(action: ModelAction) {
    if (busy) return;
    busy = true; operation = action; failure = ''; progress = undefined; controller = new AbortController();
    try {
      await pendingSettings;
      if (action === 'install') await installBrowserModel(selected, value => progress = value, controller.signal);
      if (action === 'remove') { if (loadedModel() === selected) await unloadBrowserModel(); await removeModel(selected); }
      if (action === 'unload') await unloadBrowserModel();
      if (action === 'load') await loadBrowserModel(selected, value => progress = value, controller.signal);
      await refresh();
    } catch (error) { failure = error instanceof Error ? error.message : 'Browser model operation failed.'; }
    finally { busy = false; controller = undefined; }
  }
  onMount(() => {
    let disposed = false;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => foldDuration = motion.matches ? 0 : 140;
    updateMotion(); motion.addEventListener('change', updateMotion);
    void refresh().then(readSettings).catch(error => failure = String(error));
    const storage = subscribeModels(() => { if (!disposed) void refresh(); });
    const runtime = subscribeRuntime(() => { if (!disposed) { active = loadedModel(); runtimeWorking = runtimeBusy(); } });
    return () => { disposed = true; epoch++; controller?.abort(); storage(); runtime(); motion.removeEventListener('change', updateMotion); };
  });
</script>
<section class="model-unit" aria-label={profile.title} data-model-id={selected} data-hover="foreground">
  <div class="model-row">
    <span class="model-name" title={`${profile.title} · ${engineLabel}`}>{modelName}</span>
    <span class="model-parameters" title="Parameter size">{parameterSize}</span>
    <span class="model-quantization" title="Quantization">{quantization}</span>
    <div class="model-controls">
    <span class="model-size" title="Download size">{bytes(downloadBytes(profile))}</span>
    <div class="model-actions">
      {#if busy}
        <Button variant="ghost" size="icon" tooltip="Cancel" aria-label="Cancel" disabled={!controller} onclick={() => controller?.abort()}><MaterialIcon name="close" size={18}/></Button>
      {:else if installed.includes(selected)}
        <span class="sr-only">{active === selected ? 'Loaded' : 'Installed'}</span>
        {#if active === selected}<Button variant="ghost" size="icon" tooltip="Unload model" aria-label={`Unload ${profile.title}`} disabled={runtimeWorking} onclick={() => void act('unload')}><MaterialIcon name="eject" size={18}/></Button>
        {:else}<Button variant="ghost" size="icon" tooltip="Load model" aria-label={`Load ${profile.title}`} disabled={!ready || runtimeWorking} onclick={() => void act('load')}><MaterialIcon name="play_arrow" size={18}/></Button>{/if}
        <Button variant="ghost" size="icon" tooltip="Remove model" aria-label={`Remove ${profile.title}`} disabled={runtimeWorking} onclick={() => void act('remove')}><MaterialIcon name="delete" size={18}/></Button>
      {:else}<Button variant="ghost" size="icon" tooltip={`Install ${profile.title}`} aria-label={`Install ${profile.title}`} disabled={!ready} onclick={() => void act('install')}><MaterialIcon name="install_desktop" size={18}/></Button>{/if}
      <Button variant="ghost" size="icon" tooltip="Browser compatibility" aria-label="Browser compatibility" aria-expanded={compatibilityOpen} aria-controls={`${selected}-compatibility`} onclick={() => compatibilityOpen = !compatibilityOpen}><MaterialIcon name="speed" size={18}/></Button>
      <Button variant="ghost" size="icon" tooltip="Model settings" aria-label="Model settings" aria-expanded={settingsOpen} aria-controls={`${selected}-settings`} onclick={() => settingsOpen = !settingsOpen}><MaterialIcon name="tune" size={18}/></Button>
      <Button variant="ghost" size="icon" tooltip="Detailed info" aria-label="Detailed info" aria-expanded={infoOpen} aria-controls={`${selected}-info`} onclick={() => infoOpen = !infoOpen}><MaterialIcon name="info" size={18}/></Button>
    </div>
    </div>
  </div>
  {#if busy || progress && !failure}
    <ModelOperation label={operationLabels[operation][busy ? 0 : 1]} icon={busy ? operation === 'install' ? 'downloading' : 'hourglass_top' : 'check_circle'} active={busy} {progress} progressLabel={operation === 'install' ? 'Model installation' : 'Model loading'} detail={busy ? progress?.message ?? '' : ''} />
  {/if}
  {#if failure}<div role="alert" class="failure"><MaterialIcon name="error" size={17} /><p>{failure}</p></div>{/if}
  {#if compatibilityOpen}<div class="fold-panel" id={`${selected}-compatibility`} role="region" aria-label="Browser compatibility" transition:slide={{ duration: foldDuration }}>
    <h5>Browser compatibility</h5>
    <div class="disclosure-content">
      <div class="check-actions"><p class="subtle">Check support before loading.</p><Button variant="secondary" size="sm" disabled={probing} onclick={() => void check()}><MaterialIcon name="refresh" size={15} />{probing ? 'Checking…' : 'Check this browser'}</Button></div>
      {#if facts}
        <div class="compatibility-overview"><MaterialIcon name={compatibility.ready ? 'check_circle' : 'error'} size={18} /><div><strong>{compatibility.ready ? 'Browser checks passed' : 'Checks need attention'}</strong><p>{compatibility.summary}</p></div></div>
        <ul class="compatibility-list">
          {#each compatibility.rows as row (row.id)}
            <li><details class="compatibility-check" data-state={row.state} open={row.state !== 'pass'}>
              <summary><MaterialIcon name={checkIcons[row.state] ?? 'info'} size={16} /><span class="check-title">{row.title}</span><span class="check-state">{checkLabels[row.state] ?? row.state}</span><MaterialIcon name="expand_more" size={16} class="check-chevron" /></summary>
              <p>{row.detail}</p>
            </details></li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>{/if}
  {#if settingsOpen}<div class="fold-panel" id={`${selected}-settings`} role="region" aria-label="Model settings" transition:slide={{ duration: foldDuration }}>
    <div class="disclosure-content">{#if ready}<div class="settings">
      {#if profile.category === 'decision'}<p class="model-footnote">Native decision scoring · one question · 1,024-token input limit. This model is available for decision features.</p>{:else if profile.category === 'vision'}<p class="model-footnote">Used by Gemma and MiniCPM to inspect images on demand. FP16 / Q4 · 1,024 context tokens · 256 output tokens.</p>{:else if profile.engine === 'litert-lm'}<p class="model-footnote">GPU inference · greedy decoding · reasoning and prompt caching off.</p>{/if}
      {#if (profile.category ?? 'llm') === 'llm' && profile.engine === 'wllama'}
        <div><span class="field-label">Execution</span><NavigationDropdown label="Browser execution" placeholder="Choose execution" value={execution.mode} disabled={busy || runtimeWorking} items={[{value:"auto",icon:"memory",label:"GPU preferred, allocation fallback"},{value:"gpu",icon:"memory",label:"GPU"},{value:"hybrid",icon:"memory",label:"GPU + CPU"},{value:"cpu",icon:"memory",label:"CPU"}]} onchange={value => { execution.mode = value as typeof execution.mode; saveSettings(); }} /></div>
        <label>GPU layer budget<input type="number" min="1" max={(profile.model_layers ?? 33) + 1} value={execution.gpuLayers} disabled={busy || runtimeWorking} oninput={event => { execution.gpuLayers = event.currentTarget.valueAsNumber; saveSettings(); }} /></label>
        {#if profile.projector}<label class="toggle"><input type="checkbox" data-slot="checkbox" role="switch" checked={execution.visionGpu} disabled={busy || runtimeWorking} onchange={event => { execution.visionGpu = event.currentTarget.checked; saveSettings(); }} />Vision on GPU in hybrid mode</label>{/if}
      {/if}
      {#each Object.entries(generation).filter(([key]) => labels[key]) as [key, value]}
        {#if typeof value === 'boolean'}<label class="toggle"><input type="checkbox" data-slot="checkbox" role="switch" checked={value} disabled={busy || runtimeWorking} onchange={event => { generation[key] = event.currentTarget.checked; saveSettings(); }} />{labels[key]}</label>
        {:else if typeof value === 'number'}<label>{labels[key]}<input type="number" step="any" value={value} disabled={busy || runtimeWorking} oninput={event => { generation[key] = event.currentTarget.valueAsNumber; saveSettings(); }} /></label>
        {:else}<div><span class="field-label">{labels[key]}</span><NavigationDropdown label={labels[key]!} placeholder="Choose a value" {value} disabled={busy || runtimeWorking} items={(key === 'sampling_mode' ? ['greedy','sample'] : ['f16','f32','q8_0','q4_0']).map(value => ({value,label:value,icon:"tune"}))} onchange={value => { generation[key] = value; saveSettings(); }} /></div>{/if}
      {/each}
    </div>{/if}</div>
  </div>{/if}
  {#if infoOpen}<div class="fold-panel" id={`${selected}-info`} role="region" aria-label="Detailed info" transition:slide={{ duration: foldDuration }}>
    <h5>Detailed info</h5>
    <div class="disclosure-content provenance">
      <p class="model-footnote subtle">One model can be loaded at a time.</p>
      <aside class="model-notes" aria-label="Model limitations">
        <MaterialIcon name="info" size={16} />
        <div><p>{profile.limitations}</p><p class="subtle">Mobile is unqualified. Free RAM and GPU memory cannot be measured by the page.</p>
          {#if profile.engine === 'wllama' && profile.weight_bytes > 4294967296}<p>CPU-only 9B exceeds this build’s 4 GiB Wasm heap. More system RAM does not lift that limit.</p>{/if}
        </div>
      </aside>
      <div class="pin-group">
        <h5>Model</h5>
        <dl><div><dt>Official weights</dt><dd>{profile.model}</dd></div><div><dt>Model revision</dt><dd>{profile.revision}</dd></div></dl>
      </div>
      <div class="pin-group">
        <h5>Runtime</h5>
        <dl><div><dt>Engine</dt><dd>{engineLabel}</dd></div><div><dt>Engine revision</dt><dd>{String(profile.runtime_source.source_revision ?? profile.runtime_source.revision ?? profile.runtime_source.version ?? 'Pinned source build')}</dd></div></dl>
      </div>
      <div class="pin-group">
        <h5>Recorded checks</h5>
        <p>{profile.evidence.scope}</p>
        <dl><div><dt>Attempt</dt><dd>{profile.evidence.attempt}</dd></div><div><dt>Run</dt><dd>{profile.evidence.run_id ?? 'Not recorded'}</dd></div></dl>
      </div>
      <div class="provenance-note"><MaterialIcon name="download" size={16} /><div><h5>Downloads and storage</h5><p>Files download only when you install a model. Browser storage can be cleared by the browser. Removing a model keeps files shared by other installed models.</p></div></div>
      {#if profile.engine === 'webml'}<div class="provenance-note"><MaterialIcon name="info" size={16} /><div><h5>WebML runtime</h5><p>Downloaded directly from its pinned upstream source. Its redistribution license has not been established, so it is not bundled with the editor.</p></div></div>{/if}
    </div>
  </div>{/if}
</section>
<style>
  .model-unit { container-type:inline-size; min-width:0; border-radius:4px; overflow:hidden; background:var(--color-background); }
  .model-row { display:grid; grid-template-columns:minmax(90px,140px) 40px 64px 76px minmax(0,1fr); align-items:stretch; min-width:0; font-size:.6875rem; }
  .model-controls { display:contents; }
  .model-name,.model-parameters,.model-quantization,.model-size { display:flex; align-items:center; min-height:36px; padding:0 8px; min-width:0; white-space:nowrap; }
  .model-name { background:var(--color-background); color:var(--color-foreground); font-weight:650; overflow:hidden; }
  .model-parameters,.model-quantization,.model-size { justify-content:center; border-inline-start:1px solid var(--color-surface); }
  .model-quantization,.model-size { font-size:.625rem; font-variant-numeric:tabular-nums; }
  .model-actions { display:flex; justify-content:flex-end; align-items:center; gap:0; min-width:0; }
  .model-actions :global(button[data-slot="button"]) { flex:0 0 36px; width:36px; padding:0; border-radius:0; border-inline-start:1px solid var(--color-surface); }
  .model-actions :global(button[aria-expanded="true"]) { color:var(--color-toolbar-background); }
  .fold-panel { padding:var(--pane-padding); background:var(--color-surface); border-inline:2px solid var(--color-background); border-bottom:2px solid var(--color-background); }
  .fold-panel > h5 { margin:0 0 8px; font-size:.6875rem; font-weight:650; }
  .model-unit :global(.check-chevron) { transition:transform 150ms ease; }
  .compatibility-check[open] > summary :global(.check-chevron) { transform:rotate(180deg); }
  @container settings-pane (max-width:550px) {
    .model-row { grid-template-columns:minmax(0,1fr) 40px 64px; }
    .model-controls { grid-column:1/-1; display:flex; flex-wrap:wrap; align-items:stretch; border-block-start:1px solid var(--color-surface); }
    .model-size { flex:1 0 auto; justify-content:flex-start; border-inline-start:0; }
    .model-actions { flex:0 0 auto; margin-inline-start:auto; }
  }
  p { margin: 0; font-size: .6875rem; line-height: 1.65; overflow-wrap: anywhere; }
  .subtle { color: color-mix(in srgb, var(--color-foreground) 75%, var(--color-surface)); }
  .field-label { display: block; margin-bottom: 6px; font-size: .6875rem; }
  .model-unit :global(.navigation-trigger) { background: var(--color-background); padding: 10px 12px; }
  .model-notes { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; }
  .model-notes > :global(span) { margin-top: 2px; }
  .model-notes p + p { margin-top: 6px; }
  .failure { display: grid; grid-template-columns: 17px minmax(0, 1fr); gap: 8px; color: var(--color-error-foreground); background: var(--color-error-background); padding: var(--pane-padding); border-block-start:1px solid var(--color-surface); white-space: pre-wrap; }
  .model-footnote { font-size: .625rem; }
  .settings > .model-footnote { grid-column:1/-1; }
  details { font-size: .6875rem; min-width: 0; }
  summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; border-radius: 4px; }
  summary::-webkit-details-marker { display: none; }
  .disclosure-content { display: grid; gap: 12px; padding: 4px 0 0; }
  .check-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .check-actions p { font-size: .625rem; }
  .compatibility-overview { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: start; gap: 8px; padding-block: 4px; }
  .compatibility-overview strong { display: block; font-size: .6875rem; font-weight: 600; }
  .compatibility-overview p { margin-top: 4px; font-size: .625rem; }
  .compatibility-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .compatibility-check { border-radius: 4px; background: var(--color-background); }
  .compatibility-check > summary { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto 16px; column-gap: 8px; padding: 10px; min-height: 38px; }
  .check-title { min-width: 0; line-height: 1.5; font-weight: 500; }
  .check-state { padding: 2px 6px; border-radius: 4px; background: color-mix(in srgb, var(--color-foreground) 9%, var(--color-background)); font-size: .5625rem; font-weight: 600; line-height: 1.5; }
  .compatibility-check[data-state="fail"] .check-state, .compatibility-check[data-state="warn"] .check-state { background: var(--color-emphasis); color: var(--color-background); }
  .compatibility-check > summary:focus-visible .check-state { background: transparent; color: inherit; }
  .compatibility-check > p { padding: 0 10px 12px 34px; font-size: .625rem; color: color-mix(in srgb, var(--color-foreground) 80%, var(--color-background)); }
  .settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; }
  label { display: grid; gap: 6px; font-size: .6875rem; min-width: 0; }
  .settings > label:not(.toggle), .settings > div { display:grid; grid-template-rows:1fr auto; gap:6px; min-width:0; }
  .settings > div > .field-label { margin-bottom:0; }
  .toggle { display: flex; grid-column: 1 / -1; align-items: center; gap: 8px; }
  input:not([type=checkbox]) { width: 100%; min-width: 0; padding: 10px 12px; background: var(--color-background); color: inherit; font: inherit; border: 0; border-radius: 4px; }
  .model-unit :global(.navigation-trigger:focus-visible), input:not([type=checkbox]):focus-visible { background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .pin-group { display: grid; gap: var(--pane-gap); min-width: 0; padding: var(--pane-padding); border-radius: 4px; background: var(--color-background); }
  .provenance h5 { margin: 0; font-size: .6875rem; font-weight: 600; }
  .provenance dl { display: grid; gap: 12px; margin: 0; min-width: 0; }
  .provenance dl > div { min-width: 0; }
  .provenance dt { margin-bottom: 4px; color: color-mix(in srgb, var(--color-foreground) 75%, var(--color-background)); font-size: .625rem; }
  .provenance dd { margin: 0; overflow-wrap: anywhere; font-family: ui-monospace, monospace; font-size: .625rem; line-height: 1.7; user-select: text; }
  .pin-group p { color: color-mix(in srgb, var(--color-foreground) 80%, var(--color-background)); }
  .provenance-note { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; padding-block: 4px; }
  .provenance-note p { margin-top: 6px; color: color-mix(in srgb, var(--color-foreground) 80%, var(--color-surface)); }
  @container (max-width: 250px) { .settings { grid-template-columns: minmax(0, 1fr); }.check-actions { align-items: flex-start; flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { .model-unit :global(.check-chevron) { transition: none; } }
</style>
