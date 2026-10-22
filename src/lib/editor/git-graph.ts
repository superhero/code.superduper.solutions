// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Version } from "../repository/types.ts";

export type GraphSegment = {
  from: number;
  to: number;
  kind: "through" | "incoming" | "outgoing";
  colorLane: number;
};

export type GraphRow = {
  version: Version;
  lane: number;
  segments: GraphSegment[];
  anchor?: boolean;
};

export type GitGraph = { rows: GraphRow[]; laneCount: number };

/** Display ancestry only; actual parents and retained futures remain untouched. */
export function mainlineVersions(versions: readonly Version[], current: string | null, includeFuture = false): Version[] {
  const indexed = new Map(versions.map(version => [version.oid, version]));
  const included = new Set<string>();
  let next = current && indexed.has(current) ? current : versions[0]?.oid;
  // Private undo moves a cursor along a retained line. Keep that line's future
  // visible, choosing the newest continuation containing the selected revision.
  // Memoized ancestry avoids walking shared parents once per competing fork.
  if (includeFuture && next) {
    const reachesCurrent = new Map<string, boolean>([[next, true]]);
    for (const candidate of versions) {
      const path = new Set<string>();
      let ancestor: string | undefined = candidate.oid;
      while (ancestor && !reachesCurrent.has(ancestor) && !path.has(ancestor)) {
        path.add(ancestor);
        const version = indexed.get(ancestor);
        ancestor = version ? (version.graphParents ?? version.parents)[0] : undefined;
      }
      const reaches = !!ancestor && reachesCurrent.get(ancestor) === true;
      for (const oid of path) reachesCurrent.set(oid, reaches);
      if (reaches) { next = candidate.oid; break; }
    }
  }
  while (next && !included.has(next)) {
    const version = indexed.get(next);
    if (!version) break;
    included.add(next);
    next = (version.graphParents ?? version.parents)[0];
  }
  return versions.filter(version => included.has(version.oid)).map(version => ({
    ...version, graphParents: (version.graphParents ?? version.parents).slice(0, 1),
  }));
}

export interface GraphBranch { id: string; tip: string; count: number; connection?: boolean }
export interface BranchProjection { versions: Version[]; branches: Map<string, GraphBranch[]>; anchors: string[] }

/** Independent first-parent branch paths, each controlled at its own junction. */
export function projectGraphBranches(versions: readonly Version[], current: string | null, expanded: ReadonlySet<string>, includeFuture = false): BranchProjection {
  const indexed = new Map(versions.map(version => [version.oid, version]));
  const mainline = mainlineVersions(versions, current, includeFuture);
  const trunk = new Set(mainline.map(version => version.oid));
  const assigned = new Set(trunk);
  const shared = new Map<string, Set<string>>();
  for (const version of versions) for (const parent of version.graphParents ?? []) {
    if (indexed.has(parent)) continue;
    if (!shared.has(parent)) shared.set(parent, new Set());
    shared.get(parent)!.add(version.oid);
  }
  const certified = new Set([...shared].filter(([, children]) => children.size > 1).map(([oid]) => oid));
  const groups: (GraphBranch & { junction: string; nodes: string[]; marker: boolean })[] = [];
  for (const candidate of versions) {
    if (assigned.has(candidate.oid)) continue;
    const path = new Set<string>();
    let next: string | undefined = candidate.oid;
    while (next && indexed.has(next) && !assigned.has(next) && !path.has(next)) {
      path.add(next);
      const version: Version = indexed.get(next)!;
      next = (version.graphParents ?? version.parents)[0];
    }
    const junction = next && (assigned.has(next) || certified.has(next)) ? next : `branch-root:${candidate.oid}`;
    groups.push({ id: `branch:${candidate.oid}`, tip: candidate.oid, count: path.size, nodes: [...path], junction, marker: !indexed.has(junction) });
    for (const oid of path) assigned.add(oid);
  }
  const visible = new Set(trunk);
  const anchors = new Set<string>();
  const branches = new Map<string, GraphBranch[]>();
  const addControl = (junction: string, branch: GraphBranch) => {
    if (!branches.has(junction)) branches.set(junction, []);
    branches.get(junction)!.push(branch);
  };
  // Earlier groups own the junctions used by nested groups. A collapsed parent
  // therefore hides its nested controls and rows, retaining their local state.
  for (const group of groups) {
    if (!group.marker && !visible.has(group.junction)) continue;
    if (group.marker) anchors.add(group.junction);
    addControl(group.junction, { id: group.id, tip: group.tip, count: group.count });
    if (expanded.has(group.id)) for (const oid of group.nodes) visible.add(oid);
  }
  // A merge can have a second connection to an already visible ancestor.
  // It still gets its own control, even when it adds no additional rows.
  for (const version of versions) if (trunk.has(version.oid)) {
    for (const parent of [...new Set(version.graphParents ?? version.parents)].slice(1)) {
      if (trunk.has(parent)) addControl(version.oid, { id: `connection:${version.oid}:${parent}`, tip: parent, count: 0, connection: true });
    }
  }
  const projected = versions.filter(version => visible.has(version.oid)).map(version => ({ ...version,
    graphParents: (version.graphParents ?? version.parents).filter((parent, index) => {
      if (!visible.has(parent) && !certified.has(parent)) return false;
      if (index === 0) return true;
      return !trunk.has(version.oid) || !trunk.has(parent) || expanded.has(`connection:${version.oid}:${parent}`);
    }),
  }));
  return { versions: projected, branches, anchors: [...anchors] };
}

/** Lay out Git ancestry, following projected visible ancestors when rows are filtered. */
export function layoutGitGraph(versions: readonly Version[], controlAnchors: readonly string[] = []): GitGraph {
  const visible = new Set(versions.map(version => version.oid));
  const shared = new Map<string, Set<string>>();
  for (const version of versions) for (const parent of version.graphParents ?? []) {
    if (visible.has(parent)) continue;
    if (!shared.has(parent)) shared.set(parent, new Set());
    shared.get(parent)!.add(version.oid);
  }
  // A certified hidden starting point can join forks without becoming an edit.
  // Ordinary missing Git parents are never used to infer a junction.
  const anchors = new Set([...shared].filter(([, children]) => children.size > 1).map(([oid]) => oid));
  for (const oid of controlAnchors) if (!visible.has(oid)) anchors.add(oid);
  const entries: readonly Version[] = [...versions, ...[...anchors].map(oid => ({ oid, parents: [], message: "", timestamp: 0 }))];
  const positions = new Map(entries.map((version, index) => [version.oid, index]));
  // Each occupied lane carries one edge to a pending parent. Keep separate edges
  // to the same parent until its row, so forks meet at the commit itself.
  const active: Array<string | null> = [];
  const rows: GraphRow[] = [];
  let laneCount = 0;
  const availableLane = (): number => {
    const vacant = active.indexOf(null);
    return vacant < 0 ? active.length : vacant;
  };

  for (const [index, version] of entries.entries()) {
    const incomingLane = active.indexOf(version.oid);
    const lane = incomingLane < 0 ? availableLane() : incomingLane;
    const segments: GraphSegment[] = [];
    for (let from = 0; from < active.length; from++) {
      const target = active[from];
      if (target === null) continue;
      if (target === version.oid) {
        segments.push({ from, to: lane, kind: "incoming", colorLane: from });
        active[from] = null;
      } else {
        segments.push({ from, to: from, kind: "through", colorLane: from });
      }
    }

    let firstParent = true;
    for (const parent of new Set(version.graphParents ?? version.parents)) {
      const parentIndex = positions.get(parent);
      // Truncated or malformed input must not invent links to adjacent rows.
      if (parentIndex === undefined || parentIndex <= index) continue;
      const to = firstParent ? lane : availableLane();
      firstParent = false;
      active[to] = parent;
      segments.push({ from: lane, to, kind: "outgoing", colorLane: to });
    }
    laneCount = Math.max(laneCount, lane + 1, active.length);
    rows.push({ version, lane, segments, ...(anchors.has(version.oid) ? { anchor: true } : {}) });
  }
  return { rows, laneCount };
}
