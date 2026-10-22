// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import type { GraphBranch, GraphRow, GraphSegment } from "./git-graph";

export type HistoryMotionPhase = "idle" | "messages-adjust" | "messages-fade" | "tree" | "connections";

export interface HistoryPoint { x: number; y: number }
export interface HistoryGrowthSegment {
  id: string; lane: number; color: string; from: HistoryPoint; to: HistoryPoint;
  controls?: readonly [HistoryPoint, HistoryPoint];
}
export interface HistoryGrowthPath { id: string; color: string; d: string; start: number; length: number }

/** Stitch row fragments into continuous strokes, ordered outward from their junctions. */
export function traceHistoryBranches(segments: readonly HistoryGrowthSegment[], nodes: readonly (HistoryPoint & { id: string })[]) {
  const key = (point: HistoryPoint) => `${Math.round(point.x * 64)}:${Math.round(point.y * 64)}`;
  const point = ({ x, y }: HistoryPoint) => `${Number(x.toFixed(3))} ${Number(y.toFixed(3))}`;
  function length(segment: HistoryGrowthSegment): number {
    if (!segment.controls) return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
    const [a, b] = segment.controls;
    let previous = segment.from, total = 0;
    for (let index = 1; index <= 24; index++) {
      const t = index / 24, u = 1 - t;
      const next = { x: u ** 3 * segment.from.x + 3 * u ** 2 * t * a.x + 3 * u * t ** 2 * b.x + t ** 3 * segment.to.x,
        y: u ** 3 * segment.from.y + 3 * u ** 2 * t * a.y + 3 * u * t ** 2 * b.y + t ** 3 * segment.to.y };
      total += Math.hypot(next.x - previous.x, next.y - previous.y); previous = next;
    }
    return total;
  }
  const lengths = segments.map(length), distances = new Map<string, number>();
  // Every reversed segment runs upward. Lower junctions therefore establish the
  // distance of nested junctions before their outgoing branches are visited.
  for (const index of segments.map((_, index) => index).sort((a, b) => segments[b]!.from.y - segments[a]!.from.y)) {
    const segment = segments[index]!, start = distances.get(key(segment.from)) ?? 0;
    distances.set(key(segment.from), start);
    const end = start + lengths[index]!, previous = distances.get(key(segment.to));
    if (previous === undefined || end < previous) distances.set(key(segment.to), end);
  }
  const starts = new Map<string, number[]>(), ends = new Set<string>();
  for (const [index, segment] of segments.entries()) {
    const start = `${segment.lane}:${key(segment.from)}`;
    if (!starts.has(start)) starts.set(start, []);
    starts.get(start)!.push(index); ends.add(`${segment.lane}:${key(segment.to)}`);
  }
  const roots = segments.map((_, index) => index).filter(index => !ends.has(`${segments[index]!.lane}:${key(segments[index]!.from)}`));
  const visited = new Set<number>(), paths: HistoryGrowthPath[] = [];
  for (const root of [...roots, ...segments.map((_, index) => index)]) {
    if (visited.has(root)) continue;
    const first = segments[root]!;
    let index: number | undefined = root, d = `M ${point(first.from)}`, total = 0;
    while (index !== undefined && !visited.has(index)) {
      const segment: HistoryGrowthSegment = segments[index]!;
      visited.add(index); total += lengths[index]!;
      d += segment.controls ? ` C ${point(segment.controls[0])}, ${point(segment.controls[1])}, ${point(segment.to)}` : ` L ${point(segment.to)}`;
      index = starts.get(`${segment.lane}:${key(segment.to)}`)?.find(candidate => !visited.has(candidate));
    }
    if (total > 0) paths.push({ id: first.id, color: first.color, d, start: distances.get(key(first.from)) ?? 0, length: total });
  }
  const total = Math.max(0, ...paths.map(path => path.start + path.length));
  return { paths, length: total, nodes: new Map(nodes.map(node => [node.id, distances.get(key(node)) ?? total])) };
}

export function historyConnectionKey(row: GraphRow, segment: GraphSegment): string {
  return `${row.version.oid}:${segment.kind}:${segment.from}:${segment.to}:${segment.colorLane}`;
}

/** Follow newly visible parent edges, including straight runs across retained rows. */
export function historyBranchConnections(before: readonly GraphRow[], after: readonly GraphRow[]): ReadonlySet<string> {
  const positions = (rows: readonly GraphRow[]) => new Map(rows.map((row, index) => [row.version.oid, index]));
  const parents = (row: GraphRow, index: number, positions: ReadonlyMap<string, number>) =>
    [...new Set(row.version.graphParents ?? row.version.parents)].filter(parent => (positions.get(parent) ?? -1) > index);
  const previousPositions = positions(before), nextPositions = positions(after);
  const previousParents = new Map(before.map((row, index) => [row.version.oid, new Set(parents(row, index, previousPositions))]));
  const active = new Set<number>(), connections = new Set<string>();
  for (const [index, row] of after.entries()) {
    for (const segment of row.segments) if (segment.kind !== "outgoing") {
      if (active.has(segment.from)) connections.add(historyConnectionKey(row, segment));
      if (segment.kind === "incoming") active.delete(segment.from);
    }
    const targets = parents(row, index, nextPositions);
    let target = 0;
    for (const segment of row.segments) if (segment.kind === "outgoing") {
      const parent = targets[target++];
      if (parent !== undefined && !previousParents.get(row.version.oid)?.has(parent)) {
        active.add(segment.to);
        connections.add(historyConnectionKey(row, segment));
      }
    }
  }
  return connections;
}

/** Include new/removed messages and existing messages between the junction and newest branch date. */
export function historyBranchMessageRows(
  before: readonly GraphRow[], after: readonly GraphRow[], junction: string, branches: readonly GraphBranch[],
): ReadonlySet<string> {
  const previous = new Map(before.map(row => [row.version.oid, row]));
  const next = new Map(after.map(row => [row.version.oid, row]));
  const affected = new Set<string>();
  let newest = -Infinity;
  for (const row of before) if (!row.anchor && !next.has(row.version.oid)) {
    affected.add(row.version.oid);
    newest = Math.max(newest, row.version.timestamp);
  }
  for (const row of after) if (!row.anchor && !previous.has(row.version.oid)) {
    affected.add(row.version.oid);
    newest = Math.max(newest, row.version.timestamp);
  }
  // Connection-only expansions add no rows, but still have two dated endpoints.
  if (newest === -Infinity) for (const branch of branches) {
    const tip = previous.get(branch.tip) ?? next.get(branch.tip);
    if (tip && !tip.anchor) newest = Math.max(newest, tip.version.timestamp);
  }
  const boundary = previous.get(junction) ?? next.get(junction);
  const start = boundary && !boundary.anchor ? boundary.version.timestamp : -Infinity;
  if (newest === -Infinity) newest = start;
  const lower = Math.min(start, newest), upper = Math.max(start, newest);
  for (const [id, row] of previous) {
    if (next.has(id) && !row.anchor && row.version.timestamp >= lower && row.version.timestamp <= upper) affected.add(id);
  }
  return affected;
}

/** Keep the last frame until the caller commits the next visual phase. */
export async function animateHistoryElements(
  elements: readonly Element[],
  frames: Keyframe[] | ((element: Element) => Keyframe[]),
  phase: HistoryMotionPhase,
  timing: { duration: number; easing: string },
  signal: AbortSignal,
  active: Set<Animation>,
): Promise<void> {
  if (signal.aborted || !elements.length) return;
  const animations = elements.map(element => {
    const animation = element.animate(typeof frames === "function" ? frames(element) : frames, {
      ...timing, fill: "both",
    });
    animation.id = `history-branch-${phase}`;
    active.add(animation);
    return animation;
  });
  const cancel = () => { for (const animation of animations) animation.cancel(); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
