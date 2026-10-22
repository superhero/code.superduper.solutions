// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Browser counters adapted from Operations' storage-metrics.ts.
import type { ProcessingSample } from "./processing.ts";

export type HeapSample = { used: number | null; allocated: number | null; limit: number | null; error: string | null };
export type StorageSample = { usage: number | null; quota: number | null; persisted: boolean | null;
  estimateError: string | null; persistenceError: string | null };
export type ResourceSample = { at: number; heap: HeapSample; storage: StorageSample; processing: ProcessingSample };
export const SAMPLE_INTERVAL = 2000;
export const SAMPLE_LIMIT = 1024;
export const nonnegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export const message = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason);

/** Stop waiting without treating native promises as cancelled. */
export async function bounded<T>(operation: Promise<T>, signal: AbortSignal, label: string, timeout = 5000): Promise<T> {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => reject(new Error(`${label} did not respond. Try refreshing.`)), timeout);
    })]);
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

export function collectHeap(): HeapSample {
  try {
    const heap = (globalThis.performance as (Performance & {
      memory?: { usedJSHeapSize?: unknown; totalJSHeapSize?: unknown; jsHeapSizeLimit?: unknown };
    }) | undefined)?.memory;
    return { used: nonnegative(heap?.usedJSHeapSize), allocated: nonnegative(heap?.totalJSHeapSize),
      limit: nonnegative(heap?.jsHeapSizeLimit), error: null };
  } catch (reason) { return { used: null, allocated: null, limit: null, error: message(reason) }; }
}

let estimatePending: Promise<StorageEstimate> | undefined;
let persistencePending: Promise<boolean> | undefined;
/** Share uncancellable native requests even if a caller times out or leaves the view. */
export async function collectStorage(signal: AbortSignal): Promise<StorageSample> {
  const result: StorageSample = { usage: null, quota: null, persisted: null, estimateError: null, persistenceError: null };
  let manager: StorageManager | undefined;
  try { manager = globalThis.navigator?.storage; }
  catch (reason) { result.estimateError = result.persistenceError = message(reason); return result; }
  await Promise.all([
    (async () => {
      try {
        if (!manager?.estimate) throw new Error("This browser does not expose storage estimates.");
        signal.throwIfAborted();
        estimatePending ??= Promise.resolve().then(() => manager.estimate()).finally(() => { estimatePending = undefined; });
        const estimate = await bounded(estimatePending, signal, "Storage estimate");
        result.usage = nonnegative(estimate.usage); result.quota = nonnegative(estimate.quota);
      } catch (reason) { result.estimateError = message(reason); }
    })(),
    (async () => {
      try {
        if (!manager?.persisted) throw new Error("This browser does not expose storage persistence status.");
        signal.throwIfAborted();
        persistencePending ??= Promise.resolve().then(() => manager.persisted()).finally(() => { persistencePending = undefined; });
        const persisted = await bounded(persistencePending, signal, "Persistence status");
        result.persisted = typeof persisted === "boolean" ? persisted : null;
      } catch (reason) { result.persistenceError = message(reason); }
    })(),
  ]);
  signal.throwIfAborted();
  return result;
}

export function appendSample(samples: readonly ResourceSample[], sample: ResourceSample): ResourceSample[] {
  return [...samples.slice(-(SAMPLE_LIMIT - 1)), sample];
}

export function formatBytes(value: number | null): string {
  if (nonnegative(value) === null) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const index = value! > 0 ? Math.max(0, Math.min(4, Math.floor(Math.log(value!) / Math.log(1024)))) : 0;
  return `${(value! / 1024 ** index).toLocaleString(undefined, { maximumFractionDigits: index ? 1 : 0 })} ${units[index]}`;
}
export const formatNumber = (value: number | null): string => value === null ? "Unavailable" : value.toLocaleString();
export const formatTime = (value: number | null): string => value === null ? "Unavailable" :
  value.toLocaleString(undefined, { style: "unit", unit: "millisecond", unitDisplay: "short", maximumFractionDigits: 1 });
export const ratio = (used: number | null, total: number | null): number | null =>
  used === null || total === null || total <= 0 ? null : Math.max(0, Math.min(1, used / total));
export const percentage = (value: number): string => value > 0 && value < 0.001 ? "<0.1%" :
  `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

/** Request durable origin storage once when Resources opens; the browser decides. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    const storage = navigator.storage;
    if (storage?.persist && storage.persisted && !await storage.persisted()) await storage.persist();
  } catch { /* Keep reporting the actual persistence status when permission is denied. */ }
}
