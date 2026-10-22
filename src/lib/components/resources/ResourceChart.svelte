<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import MaterialIcon from "$lib/components/MaterialIcon.svelte";
  import NavigationDropdown from "$lib/components/NavigationDropdown.svelte";
  import { formatBytes, formatTime, type ResourceSample } from "$lib/resources/browser";
  import { logarithmicTimeAxis, projectHistory, historyTicks } from "$lib/resources/history";

  let { samples }: { samples: ResourceSample[] } = $props();
  const componentId = $props.id();
  const fadeId = `${componentId}-history-fade`;
  const metrics = [
    { value: "heap", label: "Used JavaScript heap", icon: "memory_alt" },
    { value: "storage", label: "Browser storage", icon: "database" },
    { value: "blocking", label: "Main-thread blocking time", icon: "speed" },
  ];
  let metric = $state("heap");
  const label = $derived(metrics.find(item => item.value === metric)!.label);
  const points = $derived(samples.map(sample => ({ at: sample.at,
    value: metric === "heap" ? sample.heap.used : metric === "storage" ? sample.storage.usage : sample.processing.blockingTime })));
  let width = $state(800);
  const end = $derived(points.at(-1)?.at ?? Date.now());
  const axis = $derived(logarithmicTimeAxis(width, end));
  const projected = $derived(projectHistory(points, axis));
  const ticks = $derived(historyTicks(axis));
  const values = $derived(projected.filter((point): point is { at: number; value: number; x: number } => point.value !== null));
  const maximum = $derived(Math.max(1, ...values.map(point => point.value)) * 1.1);
  const y = (value: number) => 144 - value / maximum * 128;
  const path = $derived.by(() => {
    let path = "", connected = false;
    for (const point of projected) {
      if (point.value === null) { connected = false; continue; }
      path += `${connected ? "L" : "M"}${point.x},${y(point.value).toFixed(2)} `;
      connected = true;
    }
    return path;
  });
  const format = (value: number | null) => metric === "blocking" ? formatTime(value) : formatBytes(value);
</script>

<div class="chart-heading">
  <h1><MaterialIcon name="monitoring" size={24} />Resources</h1>
  <div class="metric-picker"><NavigationDropdown label="Chart metric" value={metric} placeholder="Metric" items={metrics}
    onchange={value => metric = value} matchTriggerWidth /></div>
</div>
<div class="chart-body" bind:clientWidth={width}>
{#if values.length}
  <div class="chart-summary"><strong>{format(points.at(-1)?.value ?? null)}</strong></div>
  <div class="chart-plot">
  <svg class="chart" viewBox={`0 0 ${axis.width} 168`} preserveAspectRatio="none" role="img"
    aria-label={`${label}, logarithmic time scale. Latest ${format(points.at(-1)?.value ?? null)}.`}>
    <defs>
      <linearGradient id={fadeId} gradientUnits="userSpaceOnUse" x1={axis.left} x2={axis.right} y1="0" y2="0">
        <stop offset="0%" stop-color="var(--color-foreground)" stop-opacity="0.1" />
        <stop offset="100%" stop-color="var(--color-foreground)" stop-opacity="1" />
      </linearGradient>
    </defs>
    {#each [0, 0.5, 1] as fraction}
      <line x1={axis.left} x2={axis.right} y1={y(maximum * fraction)} y2={y(maximum * fraction)} class="grid-line" />
    {/each}
    <path d={path} class="series" stroke={`url(#${fadeId})`} vector-effect="non-scaling-stroke" />
    {#if points.at(-1)?.value != null}
      <circle cx={axis.right} cy={y(points.at(-1)!.value!)} r="3" class="latest" />
    {/if}
  </svg>
  </div>
  <div class="chart-scale" role="group" aria-label="Time before latest reading">{#each ticks as tick, index}
    <span class:first={index === 0} class:last={index === ticks.length - 1} style:left={`${tick.x / axis.width * 100}%`}>{tick.label}</span>
  {/each}</div>
{:else}
  <div class="chart-empty">{samples.length ? `${label} is unavailable in this browser.` : "Waiting for the first sample…"}</div>
{/if}
</div>

<style>
  .chart-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
  h1 { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 1.125rem; font-weight: 650; }
  .metric-picker { width: min(100%, 280px); min-width: 0; font-size: .6875rem; background: var(--color-background); border-radius: 4px; }
  .metric-picker :global(.navigation-trigger) { width: 100%; height: 36px; min-height: 36px; padding-inline: 11px; }
  .metric-picker :global(.navigation-trigger > .material-symbols-rounded:last-child) { margin-left: auto; }
  .chart-body { display: flex; flex-direction: column; height: 232px; padding-top: 20px; }
  .chart-summary { padding-right: 10px; text-align: right; font-size: .6875rem; font-variant-numeric: tabular-nums; }
  .chart-plot { position: relative; flex: 1; min-height: 0; margin-top: 8px; }
  .chart { display: block; width: 100%; height: 100%; overflow: visible; }
  .grid-line { stroke: var(--color-background); stroke-width: 1; }
  .series { fill: none; stroke-width: 1.5; stroke-linejoin: round; }
  .latest { fill: var(--color-foreground); }
  .chart-scale { position: relative; flex: 0 0 18px; color: var(--color-muted-foreground); font-size: .625rem; font-variant-numeric: tabular-nums; }
  .chart-scale span { position: absolute; white-space: nowrap; transform: translateX(-50%); }
  .chart-scale .first { transform: none; }.chart-scale .last { transform: translateX(-100%); }
  .chart-empty { display: grid; flex: 1; place-items: center; min-height: 0; padding: 20px; text-align: center; color: var(--color-muted-foreground); font-size: .75rem; }
</style>
