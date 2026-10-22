// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { formatInWorker } from "./engine.ts";
import type { FormatFailure, WorkerRequest, WorkerResponse } from "./types.ts";

const scope = globalThis as unknown as Pick<Worker, "addEventListener" | "postMessage">;
let queue: Promise<void> = Promise.resolve();

function serialize(error: unknown, depth = 0): FormatFailure {
  if (depth > 8) return { name: "Error", message: "Further error causes omitted." };
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };
  return { name: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}),
    ...(error.cause !== undefined ? { cause: serialize(error.cause, depth + 1) } : {}) };
}

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  // A plugin instance has mutable configuration and host callbacks; never overlap jobs.
  queue = queue.then(async () => {
    const { id, request } = event.data;
    let response: WorkerResponse;
    try { response = { id, value: await formatInWorker(request) }; }
    catch (error) { response = { id, error: serialize(error) }; }
    scope.postMessage(response);
  });
});
