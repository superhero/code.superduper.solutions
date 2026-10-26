<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { linear } from "svelte/easing";
  import { prefersReducedMotion } from "svelte/motion";
  import { layoutGitGraph, mainlineVersions, projectGraphBranches, type GraphSegment, type GraphBranch, type GraphRow } from "$lib/editor/git-graph";
  import { Button } from "$lib/components/ui/button";
  import { renderCommitMarkdown } from "$lib/editor/commit-markdown";
  import { animateHistoryElements, historyBranchConnections, historyBranchMessageRows, historyConnectionKey as connectionKey, traceHistoryBranches, type HistoryGrowthPath, type HistoryGrowthSegment, type HistoryMotionPhase } from "$lib/editor/history-motion";
  import { changedLines } from "$lib/editor/line-summary";
  import type { Version } from "$lib/repository/types";

  let { versions, current, label = "Staged changes", emptyMessage = "No edit history yet.", selectLabel = "Load change", onselect, disabled = false, includeFuture = false }: {
    versions: Version[]; current: string | null; label?: string; emptyMessage?: string; selectLabel?: string;
    onselect?: (oid: string) => void | Promise<void>; disabled?: boolean; includeFuture?: boolean;
  } = $props();
  let list: HTMLOListElement;
  let collapsingBranches = $state(false);
  let motionPhase = $state<HistoryMotionPhase>("idle");
  let affectedRows = $state.raw<ReadonlySet<string>>(new Set());
  let fadingRows = $state.raw<ReadonlySet<string>>(new Set());
  let messageWidths = $state.raw<ReadonlyMap<string, number>>(new Map());
  let motionConnections = $state.raw<ReadonlySet<string>>(new Set());
  let growthPaths = $state.raw<readonly HistoryGrowthPath[]>([]);
  let growthNodes = $state.raw<ReadonlyMap<string, number>>(new Map());
  let growthLength = $state(1);
  let growthBounds = $state.raw({ top: 0, width: 1, height: 1 });
  let motionController: AbortController | undefined;
  const activeAnimations = new Set<Animation>();
  const groupWaiters = new Map<string, () => void>();
  function cancelMotion() {
    motionController?.abort();
    motionPhase = "idle";
    for (const group of list?.querySelectorAll("[data-branch-group]") ?? []) {
      for (const animation of group.getAnimations()) animation.finish();
    }
    for (const animation of activeAnimations) animation.cancel();
    activeAnimations.clear();
    for (const resolve of groupWaiters.values()) resolve();
    groupWaiters.clear();
    affectedRows = new Set(); fadingRows = new Set(); messageWidths = new Map();
    motionConnections = new Set(); animatedGroups = new Set();
    growthPaths = []; growthNodes = new Map(); growthLength = 1;
  }
  $effect(() => {
    versions; current;
    untrack(cancelMotion);
  });
  onDestroy(cancelMotion);
  let animatedGroups = $state.raw<ReadonlySet<string>>(new Set());
  let expandedBranches = $state.raw<ReadonlySet<string>>(new Set());
  const projection = $derived(projectGraphBranches(versions, current, expandedBranches, includeFuture));
  const graph = $derived(layoutGitGraph(projection.versions, projection.anchors));
  type RowPlan = { kind: "row"; id: string } | { kind: "group"; id: string; children: RowPlan[] };
  type RowBlock = { kind: "row"; id: string; row: GraphRow } | { kind: "group"; id: string; children: RowBlock[] };

  // Build stable groups from all retained revisions so opening a nested branch
  // does not recreate its already-visible parent group.
  function planRows(entries: readonly Version[], path: ReadonlySet<string>, prefix = "root"): RowPlan[] {
    const blocks: RowPlan[] = [];
    let pending: Version[] = [];
    function flush(before: string) {
      if (!pending.length) return;
      const indexed = new Map(pending.map(version => [version.oid, version]));
      const primary = new Set<string>();
      let version: Version | undefined = pending[0];
      while (version && !primary.has(version.oid)) {
        primary.add(version.oid);
        const parent: string | undefined = (version.graphParents ?? version.parents)[0];
        version = parent ? indexed.get(parent) : undefined;
      }
      const id = `${prefix}/before:${before}`;
      blocks.push({ kind: "group", id, children: planRows(pending, primary, id) });
      pending = [];
    }
    for (const version of entries) {
      if (!path.has(version.oid)) { pending.push(version); continue; }
      flush(version.oid);
      blocks.push({ kind: "row", id: version.oid });
    }
    flush("end");
    return blocks;
  }
  const rowPlan = $derived.by(() => {
    const anchors = graph.rows.filter(row => row.anchor).map(row => row.version);
    const path = new Set(mainlineVersions(versions, current, includeFuture).map(version => version.oid));
    for (const anchor of anchors) path.add(anchor.oid);
    return planRows([...versions, ...anchors], path);
  });
  const blocks = $derived.by(() => {
    const visible = new Map(graph.rows.map(row => [row.version.oid, row]));
    function retain(plan: readonly RowPlan[]): RowBlock[] {
      const result: RowBlock[] = [];
      for (const block of plan) {
        if (block.kind === "row") {
          const row = visible.get(block.id);
          if (row) result.push({ ...block, row });
        } else {
          const children = retain(block.children);
          if (children.length) result.push({ ...block, children });
        }
      }
      return result;
    }
    return retain(rowPlan);
  });
  function branchLabel(branches: readonly GraphBranch[]): string {
    const revisions = branches.reduce((total, branch) => total + branch.count, 0) || 1;
    return branches.length > 1 ? `${branches.length} · ${revisions}` : String(revisions);
  }
  let tagMetricsVersion = $state(0);
  let tagContext: CanvasRenderingContext2D | null = null;
  const tagMeasurements = new Map<string, number>();
  function measureBranchLabels(element: HTMLOListElement) {
    tagContext = document.createElement("canvas").getContext("2d");
    let font = "", active = true;
    function refresh(force = false) {
      if (!active || !tagContext) return;
      const size = parseFloat(getComputedStyle(document.documentElement).fontSize) * .675;
      const next = `700 ${size}px ${getComputedStyle(element).fontFamily}`;
      if (!force && next === font) return;
      font = next; tagContext.font = font; tagMeasurements.clear(); tagMetricsVersion++;
    }
    const fontLoaded = () => refresh(true);
    const observer = new MutationObserver(() => refresh());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-interface-size", "data-interface-font", "style", "class"] });
    document.fonts.addEventListener("loadingdone", fontLoaded);
    refresh();
    void document.fonts.ready.then(() => { if (active) refresh(true); });
    return { destroy() { active = false; observer.disconnect(); document.fonts.removeEventListener("loadingdone", fontLoaded); } };
  }
  function branchTagWidth(controls: ReadonlyMap<string, readonly GraphBranch[]>): number {
    void tagMetricsVersion;
    let width = 0;
    for (const branches of controls.values()) {
      const text = branchLabel(branches);
      let measured = tagMeasurements.get(text);
      if (measured === undefined) {
        measured = tagContext?.measureText(text).width ?? text.length * 6;
        tagMeasurements.set(text, measured);
      }
      width = Math.max(width, 24, Math.ceil(measured + 17));
    }
    return width;
  }
  const tagWidth = $derived(branchTagWidth(projection.branches));
  function groupIds(entries: readonly RowBlock[], result = new Set<string>()) {
    for (const block of entries) if (block.kind === "group") {
      result.add(block.id); groupIds(block.children, result);
    }
    return result;
  }
  function selectGroups(entries: readonly RowBlock[], retained: ReadonlySet<string>, motion: Set<string>) {
    for (const block of entries) if (block.kind === "group") {
      if (!retained.has(block.id)) motion.add(block.id);
      else selectGroups(block.children, retained, motion);
    }
  }
  function settleGroup(id: string) {
    groupWaiters.get(id)?.();
    groupWaiters.delete(id);
  }
  const branchMotionDuration = 180;
  function prepareGrowth() {
    const bounds = list.getBoundingClientRect(), segments: HistoryGrowthSegment[] = [];
    for (const element of list.querySelectorAll<SVGPathElement>(".graph-rail path[data-connection]")) {
      if (!motionConnections.has(element.dataset.connection!)) continue;
      const svg = element.ownerSVGElement!, matrix = element.getScreenCTM()!;
      const offset = svg.viewBox.baseVal.y, start = offset, end = offset + 50, middle = (start + end) / 2;
      const from = x(Number(element.dataset.from)), to = x(Number(element.dataset.to));
      const point = (x: number, y: number) => {
        const value = new DOMPoint(x, y).matrixTransform(matrix);
        return { x: value.x - bounds.left, y: value.y - bounds.top };
      };
      segments.push({ id: `${element.dataset.connection}:${offset}`, lane: Number(element.dataset.colorLane), color: getComputedStyle(element).stroke,
        from: point(to, end), to: point(from, start),
        ...(from === to ? {} : { controls: [point(to, middle), point(from, middle)] as const }) });
    }
    const nodes = Array.from(list.querySelectorAll<HTMLElement>(".motion-node"), element => {
      const node = element.getBoundingClientRect();
      return { id: element.closest<HTMLElement>("[data-oid]")!.dataset.oid!, x: node.left + node.width / 2 - bounds.left, y: node.top + node.height / 2 - bounds.top };
    });
    const trace = traceHistoryBranches(segments, nodes);
    const points = segments.flatMap(segment => [segment.from, segment.to, ...(segment.controls ?? [])]);
    const top = points.length ? Math.floor(Math.min(...points.map(point => point.y))) - 2 : 0;
    const bottom = Math.ceil(Math.max(...points.map(point => point.y), 0)) + 2;
    growthBounds = { top, width: bounds.width, height: bottom - top };
    growthPaths = trace.paths; growthNodes = trace.nodes; growthLength = Math.max(1, trace.length);
  }
  async function toggleBranches(branches: readonly GraphBranch[], junction: string) {
    if (motionPhase !== "idle") return;
    const previousGraph = graph, previousBlocks = blocks;
    const next = new Set(expandedBranches);
    const collapse = branches.every(branch => next.has(branch.id));
    for (const branch of branches) {
      if (collapse) next.delete(branch.id); else next.add(branch.id);
    }
    const nextProjection = projectGraphBranches(versions, current, next, includeFuture);
    const nextGraph = layoutGitGraph(nextProjection.versions, nextProjection.anchors);
    const affected = historyBranchMessageRows(previousGraph.rows, nextGraph.rows, junction, branches);
    const previousRows = new Map(previousGraph.rows.map(row => [row.version.oid, row]));
    const nextRows = new Map(nextGraph.rows.map(row => [row.version.oid, row]));
    const nextTagWidth = branchTagWidth(nextProjection.branches);
    const widths = new Map<string, { from: number; to: number }>();
    for (const id of affected) {
      const before = previousRows.get(id), after = nextRows.get(id);
      if (!before || !after || before.anchor || after.anchor) continue;
      const from = rowWidth(before) + tagWidth, to = rowWidth(after) + nextTagWidth;
      if (from !== to) widths.set(id, { from, to });
    }
    // Keep retained messages in place during folding. Opening makes their final
    // space first, so revealing the tree cannot displace them a second time.
    messageWidths = new Map([...widths].map(([id, width]) => [id, collapse ? width.from : width.to]));
    fadingRows = new Set((collapse ? previousGraph : nextGraph).rows
      .filter(row => !row.anchor && !(collapse ? nextRows : previousRows).has(row.version.oid))
      .map(row => row.version.oid));
    motionConnections = collapse ? historyBranchConnections(nextGraph.rows, previousGraph.rows)
      : historyBranchConnections(previousGraph.rows, nextGraph.rows);
    affectedRows = affected;
    collapsingBranches = collapse;
    const controller = new AbortController();
    motionController = controller;
    const duration = prefersReducedMotion.current ? 0 : branchMotionDuration;
    const alive = () => !controller.signal.aborted;
    const elements = (selector: string) => Array.from(list?.querySelectorAll(selector) ?? []);
    function timing(phase: HistoryMotionPhase) {
      // Ease the ends of the sequence, rather than restarting acceleration
      // when the tree reveal hands over to the growing strokes.
      const first = collapse ? phase === "messages-fade" || phase === "connections" : phase === "messages-adjust";
      const last = collapse ? phase === "messages-adjust" : phase === "messages-fade";
      return { duration, easing: first ? "ease-in" : last ? "ease-out" : "linear" };
    }
    const animate = (selector: string, frames: Keyframe[], phase: HistoryMotionPhase) =>
      animateHistoryElements(elements(selector), frames, phase, timing(phase), controller.signal, activeAnimations);
    async function growConnections() {
      await tick();
      return animateHistoryElements([list], [
        { "--history-branch-growth": collapse ? String(growthLength) : "0" }, { "--history-branch-growth": collapse ? "0" : String(growthLength) },
      ], "connections", timing("connections"), controller.signal, activeAnimations);
    }
    async function adjustMessages() {
      motionPhase = "messages-adjust";
      messageWidths = new Map([...widths].map(([id, width]) => [id, width.to]));
      await tick();
      const rows = elements(".motion-affected[data-oid]").filter(row => widths.has(row.getAttribute("data-oid")!));
      await animateHistoryElements(rows, row => {
        const { from, to } = widths.get(row.getAttribute("data-oid")!)!;
        return [from, to].map(width => ({ gridTemplateColumns: `${width}px minmax(0, 1fr)` }));
      }, "messages-adjust", timing("messages-adjust"), controller.signal, activeAnimations);
    }
    async function fadeMessages() {
      motionPhase = "messages-fade";
      await tick();
      await animate(".motion-fading .change-details", [
        { opacity: collapse ? 1 : 0 }, { opacity: collapse ? 0 : 1 },
      ], "messages-fade");
    }
    try {
      if (collapse) {
        await tick();
        prepareGrowth();
        await Promise.all([fadeMessages(), growConnections()]);
      } else await adjustMessages();
      if (!alive()) return;
      motionPhase = "tree";
      expandedBranches = next;
      const nextBlocks = blocks;
      const before = groupIds(previousBlocks), after = groupIds(nextBlocks), motion = new Set<string>();
      selectGroups(previousBlocks, after, motion); selectGroups(nextBlocks, before, motion);
      animatedGroups = motion;
      const waits = [...motion].map(id => new Promise<void>(resolve => groupWaiters.set(id, resolve)));
      await tick();
      await Promise.all(waits);
      if (!alive()) return;
      if (!collapse) {
        prepareGrowth();
        await growConnections();
        if (!alive()) return;
      }
      if (collapse) await adjustMessages();
      else await fadeMessages();
    } finally {
      if (motionController === controller) {
        motionPhase = "idle";
        cancelMotion();
        motionController = undefined;
      }
    }
  }
  function slideBranch(node: HTMLElement, params: { id: string }, options: { direction: "in" | "out" | "both" }) {
    if (prefersReducedMotion.current || motionPhase !== "tree" || !animatedGroups.has(params.id) || (options.direction === "out" && !collapsingBranches)) return { duration: 0 };
    const height = node.getBoundingClientRect().height;
    return {
      duration: branchMotionDuration, easing: linear,
      css: (t: number) => `overflow:hidden;min-height:0;height:${t * height}px;--branch-block-height:${height}px;`,
    };
  }
  function rowWidth(row: GraphRow): number {
    let lane = row.lane;
    for (const segment of row.segments) lane = Math.max(lane, segment.from, segment.to);
    return (lane + 1) * 20 + 4;
  }
  const date = new Intl.DateTimeFormat(undefined, {
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const colors = ["var(--color-foreground)", "var(--palette-8)", "var(--palette-9)", "var(--palette-10)"];
  const color = (lane: number) => colors[lane % colors.length];
  const x = (lane: number) => lane * 20 + 12;

  // Only the owning History viewport scrolls; focusing must not move the page.
  export function revealCurrent(panel: HTMLElement) {
    const row = list?.querySelector<HTMLElement>('li[data-oid][aria-current="true"]');
    const button = row?.querySelector<HTMLButtonElement>(".change-load");
    if (!row || !button || button.disabled) return;
    const viewport = panel.getBoundingClientRect(), bounds = row.getBoundingClientRect();
    panel.scrollTop += bounds.top + bounds.height / 2 - viewport.top - panel.clientTop - panel.clientHeight / 2;
    button.focus({ preventScroll: true });
  }

  function formattedTime(timestamp: number): string {
    return date.format(timestamp);
  }

  async function loadChange(oid: string, button: HTMLButtonElement) {
    if (disabled) return;
    await onselect?.(oid);
    await tick();
    const target = button.isConnected ? button : list?.querySelector<HTMLButtonElement>(`li[data-oid="${oid}"] > .change-load`);
    target?.focus({ preventScroll: true });
  }

  function commitMessage(message: string) {
    const prefix = /^([a-z][a-z0-9-]*)\(([^()\r\n]+)\)(!)?:[ \t]+/i.exec(message);
    return prefix
      ? { type: prefix[1] + (prefix[3] ?? ""), scope: prefix[2], text: message.slice(prefix[0].length) }
      : { type: null, scope: null, text: message };
  }


  function path(segment: GraphSegment): string {
    const start = segment.kind === "outgoing" ? 50 : 0;
    const end = segment.kind === "incoming" ? 50 : 100;
    const middle = (start + end) / 2;
    return segment.from === segment.to
      ? `M ${x(segment.from)} ${start} V ${end}`
      : `M ${x(segment.from)} ${start} C ${x(segment.from)} ${middle}, ${x(segment.to)} ${middle}, ${x(segment.to)} ${end}`;
  }
</script>

{#snippet revision(row: GraphRow)}
      {@const message = commitMessage(row.version.message)}
      {@const branches = projection.branches.get(row.version.oid) ?? []}
      {@const railWidth = rowWidth(row)}
      <li class="graph-row" class:motion-affected={affectedRows.has(row.version.oid)} class:motion-fading={fadingRows.has(row.version.oid)} style:--graph-width={`${messageWidths.get(row.version.oid) ?? rowWidth(row) + tagWidth}px`} data-minimap-surface
        data-minimap-state={affectedRows.has(row.version.oid) ? motionPhase : undefined}
        data-minimap-moving={motionPhase === "messages-adjust" && messageWidths.has(row.version.oid) ? "" : undefined}
        class:graph-anchor={row.anchor} class:selectable={!!onselect && !row.anchor && !disabled} aria-hidden={row.anchor && !branches.length ? "true" : undefined}
        data-graph-anchor={row.anchor ? row.version.oid : undefined} data-oid={row.anchor ? undefined : row.version.oid}
        data-parents={row.anchor ? undefined : row.version.parents.join(" ")} data-graph-parents={row.anchor ? undefined : (row.version.graphParents ?? row.version.parents).join(" ")}
        aria-current={!row.anchor && row.version.oid === current ? "true" : undefined}>
        <div class="graph-rail">
          {#if branches.length}
          {@const expanded = branches.every(branch => expandedBranches.has(branch.id))}
          {@const count = branches.reduce((total, branch) => total + branch.count, 0)}
          <div class="branch-tags">
            <Button class="branch-tag" variant="ghost" aria-label={`${expanded ? "Collapse" : "Expand"} ${branches.length} ${branches.length === 1 ? "branch" : "branches"} (${count} revisions)`} aria-expanded={expanded}
              data-branch-id={row.version.oid} disabled={disabled} aria-disabled={motionPhase !== "idle" ? true : undefined} onclick={() => toggleBranches(branches, row.version.oid)}>{branchLabel(branches)}</Button>
          </div>
          {/if}
          {#each [0, 50] as offset}
            <svg class:rail-upper={offset === 0} class:rail-lower={offset === 50} aria-hidden="true" style:width={`${railWidth}px`} viewBox={`0 ${offset} ${railWidth} 50`} preserveAspectRatio="none">
              {#each row.segments as segment (connectionKey(row, segment))}
                {#if offset === 0 ? segment.kind !== "outgoing" : segment.kind !== "incoming"}
                <path class:motion-connector={motionConnections.has(connectionKey(row, segment))} d={path(segment)} stroke={color(segment.colorLane)} vector-effect="non-scaling-stroke"
                  data-kind={segment.kind} data-from={segment.from} data-to={segment.to} data-color-lane={segment.colorLane} data-connection={connectionKey(row, segment)} />
                {/if}
              {/each}
            </svg>
          {/each}
          <span aria-hidden="true" class="commit-node" class:motion-node={fadingRows.has(row.version.oid)} style:left={`${tagWidth + x(row.lane)}px`} style:--node-distance={fadingRows.has(row.version.oid) ? (growthNodes.get(row.version.oid) ?? growthLength + 1) : undefined} style:--node-color={color(row.lane)}></span>
        </div>
        {#if !row.anchor}<div class="message-viewport" inert={motionPhase !== "idle" && fadingRows.has(row.version.oid)}><div class="change-details">
          <div class="change-message">
            <time class="commit-time" datetime={new Date(row.version.timestamp).toISOString()}>{formattedTime(row.version.timestamp)}</time><code class="commit-hash">{row.version.oid.slice(0, 8)}</code>{#if message.type}<code class="commit-prefix"><span class="commit-type">{message.type}</span><span class="sr-only">(</span><span class="commit-scope">{message.scope}</span><span class="sr-only">): </span></code>{/if}<div class="commit-body"><div class="commit-markdown">{@html renderCommitMarkdown(message.text).trimEnd()}</div>{#each row.version.changes ?? [] as change (change.path)}{@const lines = changedLines(change)}{#if lines}<span>{", "}</span><span class="line-change" data-path={change.path}>{#if (row.version.changes?.length ?? 0) > 1 || !row.version.message.endsWith(` ${change.path}`)}{change.path}: {/if}{lines}</span>{/if}{/each}</div>
          </div>
          <span class="sr-only">{row.version.parents.length ? `Parents: ${row.version.parents.map(oid => oid.slice(0, 8)).join(", ")}` : "Root commit"}</span>
        </div></div>{/if}
        {#if onselect && !row.anchor}
          <button type="button" class="change-load" aria-label={`${selectLabel} ${row.version.oid.slice(0, 8)}`} disabled={disabled || (motionPhase !== "idle" && affectedRows.has(row.version.oid))}
            onclick={event => loadChange(row.version.oid, event.currentTarget)}></button>
        {/if}
      </li>
{/snippet}

{#snippet branchRows(entries: RowBlock[])}
  {#each entries as block (block.id)}
    {#if block.kind === "row"}
      {@render revision(block.row)}
    {:else}
      <li class="branch-group" role="presentation" data-branch-group={block.id} in:slideBranch|global={{ id: block.id }} out:slideBranch|global={{ id: block.id }} onintroend={() => settleGroup(block.id)} onoutroend={() => settleGroup(block.id)}>
        <ol class="branch-rows" role="presentation">{@render branchRows(block.children)}</ol>
      </li>
    {/if}
  {/each}
{/snippet}

<div class="graph-scroll">
  <ol bind:this={list} use:measureBranchLabels class="change-graph" aria-label={label} data-minimap-scope data-lanes={graph.laneCount} style:--graph-motion-duration={`${branchMotionDuration}ms`} data-branch-motion={motionPhase} data-branch-direction={collapsingBranches ? "close" : "open"} aria-busy={motionPhase !== "idle"} style:--branch-tag-width={`${tagWidth}px`} style:--history-branch-growth={motionPhase === "tree" ? 0 : growthLength}>
    {#if growthPaths.length}
      <li class="branch-growth-layer" role="presentation" aria-hidden="true">
        <svg class="branch-growth-svg" aria-hidden="true" style:top={`${growthBounds.top}px`} style:width={`${growthBounds.width}px`} style:height={`${growthBounds.height}px`} viewBox={`0 ${growthBounds.top} ${growthBounds.width} ${growthBounds.height}`}>
          {#each growthPaths as path (path.id)}
            <path class="growth-line" d={path.d} stroke={path.color} pathLength="1" style:--growth-start={path.start} style:--growth-length={path.length} data-growth-start={path.start} data-growth-length={path.length} />
          {/each}
        </svg>
      </li>
    {/if}
    {#if blocks.length}
      {@render branchRows(blocks)}
    {:else}
      <li class="empty">{emptyMessage}</li>
    {/if}
  </ol>
</div>

<style>
  @property --history-branch-growth { syntax:"<number>"; inherits:true; initial-value:0; }
  /* History owns scrolling; the graph must not create a nested scroll area. */
  .graph-scroll { overflow: visible; }
  .change-graph { position:relative; list-style: none; padding: 0; margin: 0; }
  .graph-row { position: relative; display: grid; grid-template-columns: var(--graph-width) minmax(0, 1fr); column-gap: 12px; min-height: 32px; --node-y:14.25px; transition:background-color 120ms ease; }
  .graph-row { width: 100%; padding-inline: 8px; border-radius: 4px; }
  .change-load { position: absolute; inset:0 4px 0 calc(8px + var(--branch-tag-width)); z-index: 1; width:auto; height: 100%; border: 0; border-radius: inherit; padding: 0; background: transparent; --color-hover-background: transparent; }
  li.selectable::before { content:""; position:absolute; inset:0 4px 0 calc(8px + var(--branch-tag-width)); border-radius:4px; pointer-events:none; transition:background-color 120ms ease; }
  li:has(> .change-load:focus-visible)::before { background: color-mix(in srgb, var(--color-surface) 50%, transparent); }
  li[aria-current="true"]:has(> .change-load:focus)::before { background: var(--color-surface); }
  @media (hover: hover) {
    li.selectable:has(> .change-load:hover)::before { background: color-mix(in srgb, var(--color-surface) 50%, transparent); }
    .branch-tags :global(.branch-tag:hover:not(:disabled):not([aria-disabled="true"]):not([inert], [inert] *)) { background-color:var(--color-hover-background); }
  }
  @media (prefers-reduced-motion: reduce) { li, li.selectable::before { transition: none; } }
  .branch-group { list-style:none; margin:0; padding:0; --branch-block-height:initial; }
  .branch-rows { list-style:none; margin:0; padding:0; height:var(--branch-block-height, auto); }
  .branch-growth-layer { position:absolute; inset:0; z-index:1; list-style:none; pointer-events:none; }
  .branch-growth-svg { position:absolute; left:0; overflow:visible; }
  .growth-line { stroke-dasharray:1 1; stroke-dashoffset:calc(1 - clamp(0, (var(--history-branch-growth) - var(--growth-start)) / var(--growth-length), 1)); }
  .graph-rail { position:relative; display:flex; overflow:clip; }
  .branch-tags { position:relative; top:calc(var(--node-y) - 8.1px); align-self:flex-start; z-index:2; display:flex; flex-direction:column; align-items:flex-end; gap:3px; width:var(--branch-tag-width); flex-shrink:0; padding-bottom:4px; filter:drop-shadow(4px 0 0 var(--color-background)); pointer-events:none; }
  .branch-tags :global(.branch-tag) { position:relative; pointer-events:auto; min-width:24px; height:auto; min-height:0; padding:0 11px 0 6px; border-radius:4px 0 0 4px; clip-path:polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%); font-family:inherit; font-size:.675rem; font-weight:700; line-height:1.5; background:var(--color-toolbar-background); color:var(--color-toolbar-foreground); --color-hover-background:var(--tone-5); --control-hover-foreground:var(--color-background); }
  .branch-tags :global(.branch-tag:focus-visible) { background:var(--color-focus-background); color:var(--color-focus-foreground); }
  svg { position:absolute; left:var(--branch-tag-width); width:calc(100% - var(--branch-tag-width)); overflow:hidden; }
  /* Split edges at the label row so long messages never move the junction. */
  .rail-upper { top:0; height:var(--node-y); }
  .rail-lower { top:var(--node-y); height:calc(100% - var(--node-y)); }
  path { fill: none; stroke-width: 2; }
  .commit-node { position: absolute; z-index:2; top:var(--node-y); transform: translate(-50%, -50%); width: 10px; height: 10px; border: 2px solid var(--node-color); border-radius: 50%; background: var(--color-background); }
  .graph-anchor { min-height: 16px; --node-y:50%; }
  .graph-anchor .commit-node { width: 6px; height: 6px; background: var(--node-color); }
  li[aria-current="true"] .commit-node { background: var(--node-color); box-shadow: 0 0 0 3px var(--color-background), 0 0 0 4px var(--node-color); }
  /* Keep screen-reader metadata inside the row instead of extending the page. */
  .message-viewport { min-width:0; overflow:hidden; align-self:start; }
  /* Only growing strokes and arriving nodes consume the animated distance. */
  .message-viewport, .graph-row:not(.motion-fading) { --history-branch-growth:0; }
  .change-graph[data-branch-direction="open"] .motion-fading .change-details,
  .change-graph[data-branch-direction="close"][data-branch-motion="tree"] .motion-fading .change-details { opacity:0; }
  .motion-connector { visibility:hidden; }
  .motion-node { opacity:clamp(0, (var(--history-branch-growth) - var(--node-distance) + .01) * 100, 1); }
  .change-details { position: relative; display: flex; flex-direction: column; gap: 3px; min-width: 0; padding-block: 6px; align-self: start; font-size: 0.6875rem; line-height: 1.5; overflow-wrap: anywhere; }
  .change-message { font-weight: 550; }
  .commit-body { position:relative; margin-inline-start:4px; padding-inline-start:8px; padding-top:2px; }
  .commit-body::before { content:""; position:absolute; inset-block:4px 2px; inset-inline-start:0; width:1px; background:radial-gradient(circle at .5px .5px, var(--color-foreground) .5px, transparent .5px) 0 0 / 1px 4px repeat-y; pointer-events:none; }
  .commit-markdown { display: inline; }
  .commit-markdown :global(p) { margin: 0; white-space: pre-wrap; }
  /* Keep pills and line summaries inline while separating paragraph text compactly. */
  .commit-markdown :global(> p) { display: inline; }
  .commit-markdown :global(> p:not(:first-child)::before) { content: ""; display: block; height: 4px; }
  .commit-markdown :global(h1), .commit-markdown :global(h2), .commit-markdown :global(h3), .commit-markdown :global(h4), .commit-markdown :global(h5), .commit-markdown :global(h6) { margin: 0; font-weight: 750; line-height: 1.5; }
  .commit-markdown :global(h1) { font-size: 1rem; }
  .commit-markdown :global(h2) { font-size: 0.875rem; }
  .commit-markdown :global(h3) { font-size: 0.75rem; }
  .commit-markdown :global(strong) { font-weight: 750; }
  .commit-markdown :global(ul), .commit-markdown :global(ol) { margin: 0; padding-inline-start: 20px; }
  .commit-markdown :global(ul) { list-style: disc; }
  .commit-markdown :global(ol) { list-style: decimal; }
  .commit-markdown :global(blockquote) { margin: 0; padding-inline-start: 12px; }
  .commit-markdown :global(code) { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .95em; border-radius: 4px; padding: 1px 4px; background: var(--color-surface); }
  .commit-markdown :global(pre) { margin: 0; padding: 8px; border-radius: 4px; background: var(--color-surface); white-space: pre-wrap; overflow-wrap: anywhere; }
  .commit-markdown :global(pre code) { padding: 0; background: transparent; }
  .commit-markdown :global(a) { position: relative; z-index: 2; text-decoration: underline; text-underline-offset: 2px; --color-hover-background: transparent; }
  .commit-markdown :global(table) { width: 100%; table-layout: fixed; border-collapse: collapse; }
  .commit-markdown :global(th), .commit-markdown :global(td) { padding: 3px 6px; text-align: start; }
  .commit-markdown :global(hr) { height: 1px; margin-block: 6px; border: 0; background: var(--color-menu-background); }
  .commit-time, .commit-hash, .commit-prefix, .commit-type, .commit-scope, .commit-markdown :global(.commit-tag) {
    font: normal 550 9px/12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-feature-settings: normal;
    font-variation-settings: normal;
    letter-spacing: normal;
    text-transform: none;
  }
  .commit-time, .commit-hash, .commit-prefix { display: inline-flex; align-items: center; justify-content: center; margin-inline-end: 6px; border-radius: 999px; background: var(--color-menu-background); color: var(--color-background); vertical-align: middle; }
  .commit-time, .commit-hash, .commit-type, .commit-scope { padding: 0 6px; }
  .commit-time, .commit-hash { white-space: nowrap; }
  .commit-hash { background: var(--palette-4); }
  .commit-prefix { position: relative; align-items: stretch; max-width: 100%; overflow: hidden; }
  .commit-type, .commit-scope { display: flex; align-items: center; justify-content: center; text-align: center; }
  .commit-type { flex-shrink: 0; background: var(--color-menu-background); }
  .commit-scope { min-width: 0; background: var(--color-toolbar-background); }
  .commit-markdown :global(.commit-tag) { display: inline-flex; align-items: center; justify-content: center; max-width: 100%; padding: 0 6px; border-radius: 999px; background: var(--color-menu-background); color: var(--color-background); vertical-align: middle; }
  .empty { display: block; min-height: 0; padding-block: 13px; font-size: 0.625rem; }
</style>
