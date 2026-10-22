// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import "./worker-runtime.ts";
import { createRepositoryService } from "./browser.ts";
import type { StartupEvent, StartupItem } from "../startup-progress.ts";

const scope = globalThis as unknown as Pick<Worker, "addEventListener" | "postMessage">;
let observingProgress = false;
const infrastructure = new Map<StartupItem, StartupEvent>();
const repository = createRepositoryService({ onRemoteProgress: remoteProgress => scope.postMessage({ remoteProgress }), onProgress: progress => {
  if (progress.item.startsWith("storage.")) infrastructure.set(progress.item, progress);
  if (observingProgress) scope.postMessage({ progress });
} });
type Request = { id: number; method: keyof typeof repository; args: unknown[] };
type Observation = { observeProgress: boolean };
type Failure = { name: string; message: string; stack?: string; cause?: Failure };
function serialize(error: unknown, depth = 0): Failure {
  if (depth > 8) return { name: "Error", message: "Further error causes omitted." };
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };
  return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause !== undefined ? { cause: serialize(error.cause, depth + 1) } : {}) };
}
scope.addEventListener("message", async (event: MessageEvent<Request | Observation>) => {
  if ("observeProgress" in event.data) {
    observingProgress = event.data.observeProgress;
    if (observingProgress) for (const progress of infrastructure.values()) scope.postMessage({ progress });
    return;
  }
  const { id, method, args } = event.data;
  try {
    if (!Object.hasOwn(repository, method)) throw new Error(`Unknown repository operation: ${method}`);
    const operation = repository[method] as (...args: unknown[]) => Promise<unknown>;
    scope.postMessage({ id, value: await operation(...args) });
  } catch (error) { scope.postMessage({ id, error: serialize(error) }); }
});
scope.postMessage({ progress: { item: "storage.worker", status: "complete" } });
