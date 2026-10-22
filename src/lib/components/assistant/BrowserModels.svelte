<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import NavigationDropdown from '$lib/components/NavigationDropdown.svelte';
  import MaterialIcon from '$lib/components/MaterialIcon.svelte';
  import { BROWSER_PROFILES, profileById, downloadBytes } from '$lib/assistant/browser/catalog';
  import { installedModels, removeModel, subscribeModels, readModelSettings, saveModelSettings } from '$lib/assistant/browser/storage';
  import { installBrowserModel } from '$lib/assistant/browser/installer';
  import { defaultSettings, configuredProfile } from '$lib/assistant/browser/reference/settings.js';
  import { probeBrowser, compatibilityFor } from '$lib/assistant/browser/reference/compatibility.js';
  import { executionSettings, DEFAULT_EXECUTION, loadedModel, runtimeBusy, subscribeRuntime, loadBrowserModel, unloadBrowserModel } from '$lib/assistant/browser/runtime';
  import type { BrowserFacts, Progress } from '$lib/assistant/browser/types';
  type ModelAction = 'install' | 'remove' | 'load' | 'unload' | 'save';
  let selected = $state(BROWSER_PROFILES[0]!.id), installed = $state<string[]>([]), active = $state<string>();
  let busy = $state(false), runtimeWorking = $state(false), failure = $state(''), progress = $state<Progress>();
  let operation = $state<ModelAction>('install');
  let generation = $state<Record<string, number | boolean | string>>({}), execution = $state({ ...DEFAULT_EXECUTION });
  let facts = $state<BrowserFacts>(), probing = $state(false), ready = $state(false), controller = $state<AbortController>();
  let epoch = 0;
  const profile = $derived(profileById(selected));
  const compatibility = $derived(compatibilityFor(facts, profile, profile.engine === 'webml' ? 'gpu' : execution.mode));
  const items = BROWSER_PROFILES.map(model => ({ value: model.id, label: model.title, icon: 'network_intelligence' }));
  const bytes = (value: number) => `${(value / 1e9).toFixed(2)} GB`;
  const percentage = $derived(progress?.total ? Math.min(100, Math.max(0, Math.round((progress.received ?? 0) / progress.total * 100))) : undefined);
  const operationLabels: Record<ModelAction, [string, string]> = {
    install: ['Downloading model', 'Model installed'], load: ['Loading model', 'Model loaded'],
    remove: ['Removing model', 'Model removed'], unload: ['Unloading model', 'Model unloaded'], save: ['Saving settings', 'Settings saved'],
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
  async function select(id: string) {
    const request = ++epoch; selected = id; failure = ''; progress = undefined; ready = false;
    try {
      const saved = await readModelSettings(id);
      if (request !== epoch) return;
      generation = defaultSettings(profileById(id), saved.generation as Record<string, unknown> | undefined);
      execution = executionSettings(saved.execution); ready = true;
    } catch (error) { failure = error instanceof Error ? error.message : 'Could not read model settings.'; }
  }
  async function check() {
    probing = true;
    try { facts = await probeBrowser(); }
    catch (error) { failure = error instanceof Error ? error.message : 'Browser checks failed.'; }
    finally { probing = false; }
  }
  async function act(action: ModelAction) {
    if (busy) return;
    busy = true; operation = action; failure = ''; progress = undefined; controller = new AbortController();
    try {
      if (action === 'install') await installBrowserModel(selected, value => progress = value, controller.signal);
      if (action === 'remove') { if (loadedModel() === selected) await unloadBrowserModel(); await removeModel(selected); }
      if (action === 'unload') await unloadBrowserModel();
      if (action === 'load') await loadBrowserModel(selected, value => progress = value, controller.signal);
      if (action === 'save') {
        configuredProfile(profile, generation); executionSettings(execution);
        if (profile.engine === 'webml' && !['auto','gpu'].includes(execution.mode)) throw new Error('WebML supports GPU execution only.');
        if (loadedModel() === selected) await unloadBrowserModel();
        await saveModelSettings(selected, { generation: $state.snapshot(generation), execution: $state.snapshot(execution) });
        progress = { message: 'Settings saved. Load the model to apply them.' };
      }
      await refresh();
    } catch (error) { failure = error instanceof Error ? error.message : 'Browser model operation failed.'; }
    finally { busy = false; controller = undefined; }
  }
  onMount(() => {
    let disposed = false;
    void refresh().then(() => select(selected)).catch(error => failure = String(error));
    const storage = subscribeModels(() => { if (!disposed) void refresh(); });
    const runtime = subscribeRuntime(() => { if (!disposed) { active = loadedModel(); runtimeWorking = runtimeBusy(); } });
    return () => { disposed = true; epoch++; controller?.abort(); storage(); runtime(); };
  });
</script>
<section class="card" aria-label="Browser models" data-hover="foreground">
  <div class="card-heading"><h4><MaterialIcon name="memory" size={18} />Browser models</h4><span class="device-label">On this device</span></div>
  <p class="intro">Chat, images, tools and skills in your browser. Install a model to get started.</p>
  <div class="model-selection">
    <span class="field-label">Model</span>
    <NavigationDropdown label="Browser model" placeholder="Choose a browser model" value={selected} {items} disabled={busy} onchange={value => void select(value)} />
    <div class="model-meta"><span>{profile.engine === 'webml' ? 'WebML · WebGPU' : 'Wllama / llama.cpp · WebGPU with partial CPU offload'}</span><span class="download-size"><strong>{bytes(downloadBytes(profile))}</strong> download</span></div>
  </div>
  <aside class="model-notes" aria-label="Model limitations">
    <MaterialIcon name="info" size={16} />
    <div><p>{profile.limitations}</p><p class="subtle">Mobile is unqualified. Free RAM and GPU memory cannot be measured by the page.</p>
      {#if profile.engine === 'wllama'}<p>CPU-only 9B exceeds this build’s 4 GiB Wasm heap. More system RAM does not lift that limit.</p>{/if}
    </div>
  </aside>
  {#if !busy}<div class="actions">
    {#if installed.includes(selected)}
      <span class="installed"><MaterialIcon name="check_circle" size={15} />{active === selected ? 'Loaded' : 'Installed'}</span>
      {#if active === selected}<Button variant="secondary" size="sm" disabled={runtimeWorking} onclick={() => void act('unload')}>Unload</Button>
      {:else}<Button variant="secondary" size="sm" disabled={!ready || runtimeWorking} onclick={() => void act('load')}><MaterialIcon name="play_arrow" size={16} />Load</Button>{/if}
      <Button variant="secondary" size="sm" disabled={runtimeWorking} onclick={() => void act('remove')}>Remove</Button>
    {:else}<Button variant="secondary" size="sm" disabled={!ready} onclick={() => void act('install')}><MaterialIcon name="download" size={16} />Install {profile.title}</Button>{/if}
  </div>{/if}
  {#if busy || progress && !failure}
    <div class="operation" role="status" aria-atomic="true">
      <div class="operation-heading"><strong><MaterialIcon name={busy ? operation === 'install' ? 'downloading' : 'hourglass_top' : 'check_circle'} size={17} />{operationLabels[operation][busy ? 0 : 1]}</strong>
        {#if busy}<Button variant="ghost" size="sm" disabled={!controller} onclick={() => controller?.abort()}>Cancel</Button>{/if}
      </div>
      {#if progress?.total}
        <progress max={progress.total} value={progress.received ?? 0} aria-label={operation === 'install' ? 'Model installation' : 'Model loading'}></progress>
        <div class="transfer-amount"><span>{bytes(progress.received ?? 0)} / {bytes(progress.total)}</span><strong>{percentage}%</strong></div>
      {/if}
      {#if progress?.message && (busy || operation === 'save')}<p class="operation-detail">{progress.message}</p>{/if}
    </div>
  {/if}
  {#if failure}<div role="alert" class="failure"><MaterialIcon name="error" size={17} /><p>{failure}</p></div>{/if}
  <p class="model-footnote subtle">One model can be loaded at a time.</p>
  <details class="disclosure"><summary><span class="summary-title"><MaterialIcon name="fact_check" size={17} />Browser compatibility</span><MaterialIcon name="expand_more" size={18} class="disclosure-chevron" /></summary>
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
  </details>
  <details class="disclosure"><summary><span class="summary-title"><MaterialIcon name="tune" size={17} />Model settings</span><MaterialIcon name="expand_more" size={18} class="disclosure-chevron" /></summary>
    <div class="disclosure-content">{#if ready}<div class="settings">
      {#if profile.engine === 'wllama'}
        <div><span class="field-label">Execution</span><NavigationDropdown label="Browser execution" placeholder="Choose execution" value={execution.mode} disabled={busy || runtimeWorking} items={[{value:"auto",icon:"memory",label:"GPU preferred, allocation fallback"},{value:"gpu",icon:"memory",label:"GPU"},{value:"hybrid",icon:"memory",label:"GPU + CPU"},{value:"cpu",icon:"memory",label:"CPU"}]} onchange={value => execution.mode = value as typeof execution.mode} /></div>
        <label>GPU layer budget<input type="number" min="1" max="34" bind:value={execution.gpuLayers} disabled={busy || runtimeWorking} /></label>
        <label class="toggle"><input type="checkbox" role="switch" bind:checked={execution.visionGpu} disabled={busy || runtimeWorking} />Vision on GPU in hybrid mode</label>
      {/if}
      {#each Object.entries(generation).filter(([key]) => labels[key]) as [key, value]}
        {#if typeof value === 'boolean'}<label class="toggle"><input type="checkbox" role="switch" checked={value} disabled={busy || runtimeWorking} onchange={event => generation[key] = event.currentTarget.checked} />{labels[key]}</label>
        {:else if typeof value === 'number'}<label>{labels[key]}<input type="number" step="any" value={value} disabled={busy || runtimeWorking} onchange={event => generation[key] = event.currentTarget.valueAsNumber} /></label>
        {:else}<div><span class="field-label">{labels[key]}</span><NavigationDropdown label={labels[key]!} placeholder="Choose a value" {value} disabled={busy || runtimeWorking} items={(key === 'sampling_mode' ? ['greedy','sample'] : ['f16','f32','q8_0','q4_0']).map(value => ({value,label:value,icon:"tune"}))} onchange={value => generation[key] = value} /></div>{/if}
      {/each}
    </div><div class="settings-actions"><Button variant="secondary" size="sm" disabled={busy || runtimeWorking} onclick={() => void act('save')}>Save model settings</Button></div>{/if}</div>
  </details>
  <details class="disclosure"><summary><span class="summary-title"><MaterialIcon name="fingerprint" size={17} />Model and runtime pins</span><MaterialIcon name="expand_more" size={18} class="disclosure-chevron" /></summary>
    <div class="disclosure-content provenance">
      <div class="pin-group">
        <h5>Model</h5>
        <dl><div><dt>Official weights</dt><dd>{profile.model}</dd></div><div><dt>Model revision</dt><dd>{profile.revision}</dd></div></dl>
      </div>
      <div class="pin-group">
        <h5>Runtime</h5>
        <dl><div><dt>Engine</dt><dd>{profile.engine === 'webml' ? 'WebML' : 'Wllama / llama.cpp'}</dd></div><div><dt>Engine revision</dt><dd>{profile.runtime_source.source_revision ?? profile.runtime_source.revision}</dd></div></dl>
      </div>
      <div class="pin-group">
        <h5>Recorded checks</h5>
        <p>{profile.evidence.scope}</p>
        <dl><div><dt>Attempt</dt><dd>{profile.evidence.attempt}</dd></div><div><dt>Run</dt><dd>{profile.evidence.run_id ?? 'Not recorded'}</dd></div></dl>
      </div>
      <div class="provenance-note"><MaterialIcon name="download" size={16} /><div><h5>Downloads and storage</h5><p>Files download only when you install a model. Browser storage can be cleared by the browser. Removing a model keeps files shared by other installed models.</p></div></div>
      {#if profile.engine === 'webml'}<div class="provenance-note"><MaterialIcon name="info" size={16} /><div><h5>WebML runtime</h5><p>Downloaded directly from its pinned upstream source. Its redistribution license has not been established, so it is not bundled with the editor.</p></div></div>{/if}
    </div>
  </details>
</section>
<style>
  .card { container-type: inline-size; display: grid; gap: 16px; min-width: 0; padding: 16px; border-radius: 4px; background: var(--color-surface); flex-shrink: 0; }
  .card-heading, h4 { display: flex; align-items: center; gap: 8px; }
  .card-heading { justify-content: space-between; flex-wrap: wrap; }
  h4 { margin: 0; font-size: .75rem; font-weight: 700; }
  p { margin: 0; font-size: .6875rem; line-height: 1.65; overflow-wrap: anywhere; }
  .intro, .subtle, .device-label { color: color-mix(in srgb, var(--color-foreground) 75%, var(--color-surface)); }
  .device-label { font-size: .625rem; }
  .model-selection { min-width: 0; }
  .field-label { display: block; margin-bottom: 6px; font-size: .6875rem; }
  .card :global(.navigation-trigger) { background: var(--color-background); padding: 10px 12px; }
  .model-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 8px 16px; flex-wrap: wrap; margin-top: 10px; font-size: .625rem; line-height: 1.6; }
  .model-meta > span:first-child { flex: 1 1 110px; }
  .download-size { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .download-size strong { font-size: .6875rem; font-weight: 600; }
  .model-notes { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; }
  .model-notes > :global(span) { margin-top: 2px; }
  .model-notes p + p { margin-top: 6px; }
  .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .installed { display: inline-flex; gap: 6px; align-items: center; margin-right: auto; font-size: .6875rem; }
  .operation { display: grid; gap: 10px; min-width: 0; padding: 12px; border-radius: 4px; background: var(--color-background); }
  .operation-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 32px; }
  .operation-heading > strong { display: inline-flex; gap: 8px; align-items: center; font-size: .6875rem; font-weight: 600; }
  .transfer-amount { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: .625rem; font-variant-numeric: tabular-nums; }
  .transfer-amount strong { font-weight: 600; }
  .operation-detail { font-size: .625rem; color: color-mix(in srgb, var(--color-foreground) 75%, var(--color-background)); }
  progress { display: block; appearance: none; width: 100%; height: 6px; border: 0; border-radius: 4px; overflow: hidden; background: var(--color-surface); accent-color: var(--color-foreground); }
  progress::-webkit-progress-bar { background: var(--color-surface); border-radius: 4px; }
  progress::-webkit-progress-value { background: var(--color-foreground); border-radius: 4px; transition: width 150ms ease-out; }
  progress::-moz-progress-bar { background: var(--color-foreground); border-radius: 4px; }
  .failure { display: grid; grid-template-columns: 17px minmax(0, 1fr); gap: 8px; color: var(--color-error-foreground); background: var(--color-error-background); padding: 12px; border-radius: 4px; white-space: pre-wrap; }
  .model-footnote { font-size: .625rem; }
  details { font-size: .6875rem; min-width: 0; }
  summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; border-radius: 4px; }
  summary::-webkit-details-marker { display: none; }
  .disclosure { background: repeating-linear-gradient(to right, var(--color-background) 0 6px, transparent 6px 14px) top / 100% 1px no-repeat; }
  .disclosure > summary { justify-content: space-between; min-height: 40px; padding: 10px 0; font-weight: 600; }
  .summary-title { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
  .card :global(.disclosure-chevron), .card :global(.check-chevron) { transition: transform 150ms ease; }
  .disclosure[open] > summary :global(.disclosure-chevron), .compatibility-check[open] > summary :global(.check-chevron) { transform: rotate(180deg); }
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
  .toggle { display: flex; grid-column: 1 / -1; align-items: center; gap: 8px; }
  input:not([type=checkbox]) { width: 100%; min-width: 0; padding: 10px 12px; background: var(--color-background); color: inherit; font: inherit; border: 0; border-radius: 4px; }
  .card :global(.navigation-trigger:focus-visible), input:not([type=checkbox]):focus-visible { background: var(--color-focus-background); color: var(--color-focus-foreground); }
  .settings-actions { display: flex; justify-content: flex-end; }
  .pin-group { display: grid; gap: 12px; min-width: 0; padding: 12px; border-radius: 4px; background: var(--color-background); }
  .provenance h5 { margin: 0; font-size: .6875rem; font-weight: 600; }
  .provenance dl { display: grid; gap: 12px; margin: 0; min-width: 0; }
  .provenance dl > div { min-width: 0; }
  .provenance dt { margin-bottom: 4px; color: color-mix(in srgb, var(--color-foreground) 75%, var(--color-background)); font-size: .625rem; }
  .provenance dd { margin: 0; overflow-wrap: anywhere; font-family: ui-monospace, monospace; font-size: .625rem; line-height: 1.7; user-select: text; }
  .pin-group p { color: color-mix(in srgb, var(--color-foreground) 80%, var(--color-background)); }
  .provenance-note { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; padding-block: 4px; }
  .provenance-note p { margin-top: 6px; color: color-mix(in srgb, var(--color-foreground) 80%, var(--color-surface)); }
  @container (max-width: 250px) { .settings { grid-template-columns: minmax(0, 1fr); }.check-actions { align-items: flex-start; flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { progress::-webkit-progress-value { transition: none; }.card :global(.disclosure-chevron), .card :global(.check-chevron) { transition: none; } }
</style>
