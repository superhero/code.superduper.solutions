// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Adapted from Operations' page-memory.ts, with explicit isolation and lifecycle handling.
import { bounded, message, nonnegative } from "./browser.ts";

export type PageMemoryReport = { total: number | null; groups: { label: string; bytes: number }[]; error: string | null };
type MemoryPerformance = Performance & { measureUserAgentSpecificMemory?: () => Promise<unknown> };
let pending: Promise<PageMemoryReport> | undefined;

export function pageMemoryUnavailable(): string | null {
  try {
    if (!globalThis.isSecureContext) return "Page memory measurement requires HTTPS or localhost.";
    if (!globalThis.crossOriginIsolated) return "Page memory measurement requires cross-origin isolation.";
    if (typeof (globalThis.performance as MemoryPerformance | undefined)?.measureUserAgentSpecificMemory !== "function")
      return "This browser does not support page memory measurement.";
    return null;
  } catch (reason) { return message(reason); }
}

function summarize(value: unknown): PageMemoryReport {
  if (!value || typeof value !== "object") throw new Error("The browser returned an invalid page memory measurement.");
  const measurement = value as { bytes?: unknown; breakdown?: unknown };
  const total = nonnegative(measurement.bytes);
  if (total === null) throw new Error("The browser returned an invalid page memory total.");
  const groups = new Map<string, { label: string; bytes: number }>();
  if (Array.isArray(measurement.breakdown)) for (const entry of measurement.breakdown) {
    if (!entry || typeof entry !== "object") continue;
    const bytes = nonnegative(entry.bytes);
    if (bytes === null) continue;
    const types: string[] = Array.isArray(entry.types) ? [...new Set<string>(entry.types
      .filter((type: unknown): type is string => typeof type === "string" && type.length > 0))].sort() : [];
    if (!types.length && !bytes) continue;
    const key = JSON.stringify(types), group = groups.get(key) ?? { label: types.join(" + ") || "Other", bytes: 0 };
    group.bytes += bytes; groups.set(key, group);
  }
  return { total, groups: [...groups.values()].sort((left, right) => right.bytes - left.bytes), error: null };
}

/** Manual measurement only. Never retain attribution URLs or start overlapping native measurements. */
export async function collectPageMemory(signal: AbortSignal): Promise<PageMemoryReport> {
  try {
    const unavailable = pageMemoryUnavailable();
    if (unavailable) throw new Error(unavailable);
    signal.throwIfAborted();
    if (!pending) {
      const performance = globalThis.performance as MemoryPerformance;
      pending = Promise.resolve().then(() => performance.measureUserAgentSpecificMemory!()).then(summarize)
        .finally(() => { pending = undefined; });
    }
    return await bounded(pending, signal, "Page memory measurement", 30000);
  } catch (reason) {
    signal.throwIfAborted();
    return { total: null, groups: [], error: message(reason) };
  }
}
