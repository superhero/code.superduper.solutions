// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from Operations' processing-metrics.ts; each view owns its observer.

export type ProcessingSample = {
  longTasks: number | null;
  longTaskTime: number | null;
  blockingTime: number | null;
  longestTask: number | null;
  interval: number | null;
  error: string | null;
};

/** Main-thread elapsed task durations, never a CPU utilization estimate. */
export function createProcessingMonitor() {
  let observer: PerformanceObserver | undefined;
  let started = 0, intervalStarted = 0, watermark = -Infinity;
  let count = 0, time = 0, blocking = 0, longest = 0;
  let error: string | null = "Long-task monitoring is paused.";
  const reset = () => { count = time = blocking = longest = 0; };
  function accumulate(entries: PerformanceEntry[]) {
    for (const entry of entries) {
      const { startTime, duration } = entry;
      if (entry.entryType !== "longtask" || !Number.isFinite(startTime) || !Number.isFinite(duration)
        || duration < 50 || startTime < started || startTime <= watermark) continue;
      watermark = startTime;
      count++;
      time += duration;
      blocking += Math.max(0, duration - 50);
      longest = Math.max(longest, duration);
    }
  }
  function stop() {
    observer?.disconnect();
    observer = undefined;
    reset();
    error = "Long-task monitoring is paused.";
  }
  function start() {
    if (observer) return;
    reset(); watermark = -Infinity;
    try {
      if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
        error = "This browser does not support long-task measurements.";
        return;
      }
      started = intervalStarted = performance.now();
      const current = new PerformanceObserver(entries => {
        if (observer === current) accumulate(entries.getEntries());
      });
      observer = current;
      current.observe({ type: "longtask" });
      error = null;
    } catch (reason) { stop(); error = reason instanceof Error ? reason.message : String(reason); }
  }
  function read(): ProcessingSample {
    if (observer) try {
      accumulate(observer.takeRecords());
      const now = performance.now();
      const sample = { longTasks: count, longTaskTime: time, blockingTime: blocking, longestTask: longest,
        interval: Math.max(0, now - intervalStarted), error: null };
      intervalStarted = now;
      reset();
      return sample;
    } catch (reason) { stop(); error = reason instanceof Error ? reason.message : String(reason); }
    return { longTasks: null, longTaskTime: null, blockingTime: null, longestTask: null, interval: null, error };
  }
  return { start, stop, read };
}
