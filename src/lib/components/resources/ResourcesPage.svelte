<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS.
Browser resource cards adapted from Operations' settings/StorageSettings.svelte. -->
<script lang="ts">
  import { onMount } from "svelte";
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import { Button } from "$lib/components/ui/button";
  import ResourceChart from "./ResourceChart.svelte";
  import { appendSample, collectHeap, collectStorage, requestPersistentStorage, formatBytes, formatNumber, formatTime, percentage, ratio,
    SAMPLE_INTERVAL, type ResourceSample } from "$lib/resources/browser";
  import { createProcessingMonitor } from "$lib/resources/processing";
  import { collectPageMemory, pageMemoryUnavailable, type PageMemoryReport } from "$lib/resources/page-memory";
  import { inspectDatabases, type DatabaseReport } from "$lib/resources/databases";
  import type { RepositorySnapshot } from "$lib/repository/types";

  let { repository, repositoryCount, samples = $bindable<ResourceSample[]>([]), paused = $bindable(false), refreshing = $bindable(false) }:
    { repository: RepositorySnapshot | null; repositoryCount: number; samples?: ResourceSample[]; paused?: boolean; refreshing?: boolean } = $props();
  const latest = $derived(samples.at(-1));
  let inspecting = $state(false), measuring = $state(false);
  let databases = $state.raw<DatabaseReport>();
  let pageMemory = $state.raw<PageMemoryReport>();
  const memoryUnavailable = pageMemoryUnavailable();
  const storageRatio = $derived(ratio(latest?.storage.usage ?? null, latest?.storage.quota ?? null));
  const heapRatio = $derived(ratio(latest?.heap.used ?? null, latest?.heap.allocated ?? null));
  const databaseRecords = $derived(databases?.databases.reduce((total, database) =>
    total + database.stores.reduce((sum, store) => sum + store.records, 0), 0) ?? null);
  const databaseStores = $derived(databases?.databases.reduce((total, database) => total + database.stores.length, 0) ?? null);
  const readableDatabases = $derived(databases?.databases.some(database => !database.error || database.stores.length));
  let measureMemory = () => {};
  let refreshResources = () => {}, synchronizeMonitoring = () => {};
  export function refresh() { refreshResources(); }
  export function toggleMonitoring() { paused = !paused; synchronizeMonitoring(); }

  onMount(() => {
    void requestPersistentStorage();
    let disposed = false, timer: ReturnType<typeof setTimeout> | undefined;
    let cycle: AbortController | undefined, inspection: AbortController | undefined, measurement: AbortController | undefined;
    const processing = createProcessingMonitor();
    async function sample() {
      if (disposed || document.hidden || cycle) return;
      clearTimeout(timer);
      const current = new AbortController(); cycle = current; refreshing = true;
      try {
        const storage = await collectStorage(current.signal);
        if (!disposed && cycle === current && !current.signal.aborted) samples = appendSample(samples,
          { at: Date.now(), heap: collectHeap(), storage, processing: processing.read() });
      } catch { /* A hidden or unmounted view discards its unfinished sample. */ }
      finally {
        if (cycle === current) {
          cycle = undefined; refreshing = false;
          if (!disposed && !document.hidden && !paused) timer = setTimeout(() => void sample(), SAMPLE_INTERVAL);
        }
      }
    }
    async function inspect() {
      if (disposed || document.hidden || inspection) return;
      const current = new AbortController(); inspection = current; inspecting = true;
      try {
        const report = await inspectDatabases(current.signal);
        if (!disposed && !current.signal.aborted) databases = report;
      } catch { /* Cancellation releases the read-only inspection. */ }
      finally { if (inspection === current) { inspection = undefined; inspecting = false; } }
    }
    function synchronize() {
      clearTimeout(timer); cycle?.abort(); cycle = undefined; refreshing = false;
      processing.stop(); const visible = !document.hidden && !paused;
      if (!visible) {
        inspection?.abort(); inspection = undefined; inspecting = false;
        measurement?.abort(); measurement = undefined; measuring = false;
      }
      if (visible) { processing.start(); void sample(); }
      if (visible && !databases) void inspect();
    }
    measureMemory = () => {
      if (disposed || document.hidden || measurement || memoryUnavailable) return;
      const current = new AbortController(); measurement = current; measuring = true;
      void collectPageMemory(current.signal).then(report => {
        if (!disposed && !current.signal.aborted) { pageMemory = report; }
      }).catch(() => {}).finally(() => { if (measurement === current) { measurement = undefined; measuring = false; } });
    };
    refreshResources = () => { void sample(); void inspect(); };
    synchronizeMonitoring = synchronize;
    document.addEventListener("visibilitychange", synchronize);
    synchronize();
    return () => {
      disposed = true;
      clearTimeout(timer); cycle?.abort(); inspection?.abort(); measurement?.abort(); processing.stop();
      document.removeEventListener("visibilitychange", synchronize);
    };
  });
</script>

<section class="resources-page" aria-label="Browser resources" data-samples={samples.length}>

  <div class="resource-grid">
    <section class="resource-card wide" aria-label="Live resource history"><ResourceChart {samples} /></section>

    <section class="resource-card" aria-label="Processing">
      <h2><MaterialIcon name="speed" size={20} />Processing</h2>
      <dl class="metrics">
        <div><dt>Long tasks</dt><dd>{formatNumber(latest?.processing.longTasks ?? null)}</dd></div>
        <div><dt>Longest task</dt><dd>{formatTime(latest?.processing.longestTask ?? null)}</dd></div>
        <div><dt>Long-task time</dt><dd>{formatTime(latest?.processing.longTaskTime ?? null)}</dd></div>
        <div><dt>Blocking time</dt><dd>{formatTime(latest?.processing.blockingTime ?? null)}</dd></div>
      </dl>
      {#if latest?.processing.error}<p class="note">{latest.processing.error}</p>{/if}
    </section>

    <section class="resource-card" aria-label="Memory">
      <h2><MaterialIcon name="memory_alt" size={20} />Memory</h2>
      <dl class="metrics">
        <div><dt>Used heap</dt><dd>{formatBytes(latest?.heap.used ?? null)}</dd></div>
        <div><dt>Allocated heap</dt><dd>{formatBytes(latest?.heap.allocated ?? null)}</dd></div>
        <div><dt>Heap limit</dt><dd>{formatBytes(latest?.heap.limit ?? null)}</dd></div>
        <div><dt>Measured page memory</dt><dd>{pageMemory ? formatBytes(pageMemory.total) : memoryUnavailable ? "Unavailable" : "On demand"}</dd></div>
      </dl>
      {#if heapRatio !== null}<div class="meter-heading"><strong>{percentage(heapRatio)} of allocated heap</strong></div><meter min="0" max="1" value={heapRatio} aria-label="JavaScript heap utilization">{percentage(heapRatio)}</meter>{/if}
      {#if latest && latest.heap.used === null}<p class="note">Heap measurements are unavailable in this browser.</p>{/if}
      {#if latest?.heap.error}<p class="notice">{latest.heap.error}</p>{/if}
      <div class="memory-action"><Button variant="secondary" size="sm" aria-label="Measure page memory" disabled={Boolean(memoryUnavailable) || measuring} aria-busy={measuring} onclick={() => measureMemory()}><MaterialIcon name="memory_alt" size={17} />{measuring ? "Measuring…" : "Measure page memory"}</Button></div>
      <p class="note">{memoryUnavailable ?? "Page memory is a separate, on-demand measurement and can take up to 30 seconds."}</p>
      {#if pageMemory?.error}<p class="notice">{pageMemory.error}</p>{/if}
      {#if pageMemory?.groups.length}<table class="memory-groups" aria-label="Page memory breakdown"><tbody>{#each pageMemory.groups as group}<tr><th scope="row">{group.label}</th><td>{formatBytes(group.bytes)}</td></tr>{/each}</tbody></table>{/if}
    </section>

    <section class="resource-card" aria-label="Storage">
      <h2><MaterialIcon name="database" size={20} />Storage</h2>
      <dl class="metrics">
        <div><dt>Used storage</dt><dd>{formatBytes(latest?.storage.usage ?? null)}</dd></div>
        <div><dt>Estimated quota</dt><dd>{formatBytes(latest?.storage.quota ?? null)}</dd></div>
        <div><dt>Available quota</dt><dd>{formatBytes(latest?.storage.quota != null && latest.storage.usage != null ? Math.max(0, latest.storage.quota - latest.storage.usage) : null)}</dd></div>
        <div><dt>Persistence</dt><dd class="text-value">{latest?.storage.persisted == null ? "Unavailable" : latest.storage.persisted ? "Persistent" : "Best effort"}</dd></div>
      </dl>
      {#if storageRatio !== null}<div class="meter-heading"><strong>{percentage(storageRatio)} of estimated quota</strong></div><meter min="0" max="1" value={storageRatio} aria-label="Estimated storage utilization">{percentage(storageRatio)}</meter>{/if}
      {#if latest?.storage.persisted === false}
        <p class="note">The browser may clear best-effort storage when space is needed.</p>
      {/if}
      {#if latest?.storage.estimateError}<p class="notice">{latest.storage.estimateError}</p>{/if}
      {#if latest?.storage.persistenceError}<p class="notice">{latest.storage.persistenceError}</p>{/if}
    </section>

    <section class="resource-card" aria-label="Repositories">
      <h2><MaterialIcon name="folder_data" size={20} />Repositories</h2>
      <dl class="metrics">
        <div><dt>Local repositories</dt><dd>{formatNumber(repositoryCount)}</dd></div>
        <div><dt>Files in current repository</dt><dd>{formatNumber(repository?.files.length ?? null)}</dd></div>
        <div><dt>Loaded editing revisions</dt><dd>{formatNumber(repository?.history.length ?? null)}</dd></div>
        <div><dt>Loaded Git commits</dt><dd>{formatNumber(repository?.commits.length ?? null)}</dd></div>
      </dl>
      {#if !repository}<p class="note">Open a repository to see its file and history counts.</p>{/if}
    </section>

    <section class="resource-card wide" aria-label="IndexedDB records" aria-busy={inspecting}>
      <div class="database-heading"><h2><MaterialIcon name="storage" size={20} />IndexedDB records</h2></div>
      {#if databases?.error}<p class="notice">{databases.error}</p>{/if}
      <dl class="metrics database-summary">
        <div><dt>Inspected databases</dt><dd>{formatNumber(databases && (!databases.error || databases.databases.length) ? databases.databases.length : null)}</dd></div>
        <div><dt>Readable object stores</dt><dd>{formatNumber(readableDatabases ? databaseStores : databases && !databases.error ? 0 : null)}</dd></div>
        <div><dt>Readable records</dt><dd>{formatNumber(readableDatabases ? databaseRecords : databases && !databases.error ? 0 : null)}</dd></div>
      </dl>
      <div class="databases">
        {#each databases?.databases ?? [] as database (database.name)}
          <details class="database">
            <summary><span>{database.name}</span><strong>{database.error && !database.stores.length ? "Unavailable" : `${formatNumber(database.stores.reduce((total, store) => total + store.records, 0))} records`}</strong></summary>
            {#if database.error}<p class="notice">{database.error}</p>{/if}
            <dl class="store-list">{#each database.stores as store}<div><dt>{store.name}</dt><dd>{formatNumber(store.records)}</dd></div>{/each}</dl>
          </details>
        {/each}
      </div>
    </section>
  </div>
</section>

<style>
  .resources-page { max-width: 1180px; padding: var(--pane-gap); margin: 0; }
  h2 { display: flex; align-items: center; gap: .5rem; margin: 0; font-size: .875rem; font-weight: 650; line-height:1.4; }
  .note { font-size: .6875rem; line-height: 1.65; color: var(--color-muted-foreground); }
  p { margin: 6px 0 0; }
  .memory-action :global(button) { font-size: .6875rem; }
  .resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: var(--pane-gap); }
  .resource-card { min-width: 0; padding: var(--pane-padding); background: var(--color-surface); border-radius: 4px; }
  .wide { grid-column: 1 / -1; }
  .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pane-gap); margin: 20px 0 14px; }
  .metrics > div { min-width: 0; padding: var(--pane-padding); background: var(--color-background); border-radius: 4px; }
  dt { font-size: .6875rem; color: var(--color-muted-foreground); } dd { margin: 4px 0 0; overflow-wrap: anywhere; font-size: clamp(.875rem, 1.7vw, 1.25rem); font-weight: 650; font-variant-numeric: tabular-nums; }
  .text-value { font-size: 1rem; }
  .meter-heading { margin-bottom: 6px; font-size: .6875rem; }
  meter { display: block; appearance: none; width: 100%; height: 6px; margin-bottom: 12px; background: var(--color-background); border: 0; border-radius: 4px; }
  meter::-webkit-meter-bar { background: var(--color-background); border: 0; border-radius: 4px; }
  meter::-webkit-meter-optimum-value { background: var(--color-foreground); border-radius: 4px; }
  meter::-moz-meter-bar { background: var(--color-foreground); border-radius: 4px; }
  .memory-action { margin-top: 14px; }
  .memory-action :global(button) { display: flex; width: 100%; }
  .notice { font-size: .6875rem; line-height: 1.6; overflow-wrap: anywhere; }
  .memory-groups { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 12px; }
  .memory-groups th, .memory-groups td { width: 50%; border: 0; padding: 4px 6px; font-size: .6875rem; overflow-wrap: anywhere; }
  .memory-groups th { text-align: right; font-weight: 400; }
  .memory-groups td { text-align: left; }
  .store-list { margin: 12px 0 0; }.store-list > div { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; }.store-list dd { margin: 0; font-size: .6875rem; }
  .database-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .database-summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .databases { display: grid; gap: var(--pane-gap); }
  .database { min-width: 0; background: var(--color-background); border-radius: 4px; padding: var(--pane-padding); }
  summary { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; cursor: pointer; font-size: .6875rem; border-radius: 4px; outline: none; }
  summary span { overflow-wrap: anywhere; min-width: 0; }summary strong { flex-shrink: 0; font-variant-numeric: tabular-nums; }
  summary::before { content: "›"; flex-shrink: 0; }details[open] summary::before { content: "⌄"; }summary span { flex: 1; }
  summary:focus-visible { background: var(--color-hover-background); color: var(--color-foreground); }
  @container resources-pane (max-width: 850px) { .resource-grid { grid-template-columns: minmax(0, 1fr); } }
  @container resources-pane (max-width: 500px) { .database-summary { grid-template-columns: minmax(0, 1fr); }.database summary { flex-wrap: wrap; } }
  @media (max-width: 850px) { .resource-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 500px) { .resources-page { padding: var(--pane-gap); }.resource-card { padding: var(--pane-padding); }.database-summary { grid-template-columns: minmax(0, 1fr); }.database summary { flex-wrap: wrap; } }
</style>
