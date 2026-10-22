// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { SAMPLE_INTERVAL } from "./browser.ts";

export type HistoryPoint = { at: number; value: number | null };
export type PlotPoint = HistoryPoint & { x: number };
const COMPRESSION = 12;

/** Real CSS-pixel coordinates: recent intervals are wider; the oldest interval is one pixel. */
export function logarithmicTimeAxis(width: number, end: number) {
  width = Math.max(25, Math.floor(Number.isFinite(width) ? width : 800));
  const left = 12, right = width - 12;
  const scale = (right - left) / Math.log(COMPRESSION);
  const unit = SAMPLE_INTERVAL / (COMPRESSION * Math.expm1(1 / scale));
  const duration = unit * (COMPRESSION - 1);
  const x = (at: number) => right - scale * Math.log1p(Math.max(0, end - at) / unit);
  return { width, left, right, end, oldest: end - duration, duration, x };
}

/** Keep first/last and extrema in each pixel column, retaining gaps and the order of spikes. */
export function projectHistory(points: readonly HistoryPoint[], axis: ReturnType<typeof logarithmicTimeAxis>): PlotPoint[] {
  const result: PlotPoint[] = [];
  let column = -1;
  let first: PlotPoint | undefined, last: PlotPoint | undefined, low: PlotPoint | undefined, high: PlotPoint | undefined;
  let firstIndex = 0, lastIndex = 0, lowIndex = 0, highIndex = 0;
  function flush() {
    if (!first || !last || !low || !high) return;
    const candidates = new Map([[firstIndex, first], [lowIndex, low], [highIndex, high], [lastIndex, last]]);
    result.push(...[...candidates].sort(([left], [right]) => left - right).map(([, point]) => point));
    first = last = low = high = undefined;
  }
  for (const [index, point] of points.entries()) {
    if (!Number.isFinite(point.at) || point.at < axis.oldest || point.at > axis.end) continue;
    const x = Math.max(axis.left, Math.min(axis.right, Math.floor(axis.x(point.at))));
    if (point.value === null || !Number.isFinite(point.value)) {
      flush(); column = -1;
      if (result.at(-1)?.value !== null) result.push({ ...point, value: null, x });
      continue;
    }
    if (column !== x) { flush(); column = x; }
    const projected = { ...point, x };
    if (!first) { first = low = high = projected; firstIndex = lowIndex = highIndex = index; }
    last = projected; lastIndex = index;
    if (point.value < low!.value!) { low = projected; lowIndex = index; }
    if (point.value > high!.value!) { high = projected; highIndex = index; }
  }
  flush();
  return result;
}

export function historyAge(age: number): string {
  const seconds = Math.round(Math.max(0, age) / 1000), minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m${seconds % 60 ? ` ${seconds % 60}s` : ""} ago` : `${seconds}s ago`;
}

/** Actual positions on the logarithmic axis; reserve space for its two endpoints. */
export function historyTicks(axis: ReturnType<typeof logarithmicTimeAxis>) {
  const ticks = [{ x: axis.right, label: "Latest" }];
  const gap = 72;
  for (const age of [10000, 30000, 60000, 120000, 300000, 600000, 1200000, 1800000, 3600000]) {
    if (age >= axis.duration) break;
    const x = axis.x(axis.end - age);
    if (ticks.at(-1)!.x - x >= gap && x - axis.left >= gap) ticks.push({ x, label: historyAge(age) });
  }
  if (axis.right - axis.left >= gap) ticks.push({ x: axis.left, label: historyAge(axis.duration) });
  return ticks.reverse();
}
