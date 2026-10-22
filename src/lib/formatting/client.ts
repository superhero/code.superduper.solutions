// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import FormattingWorker from "./worker.ts?worker&inline";
import type { FormatFailure, FormatRequest, WorkerResponse } from "./types.ts";
export type { FormatRequest } from "./types.ts";

const timeoutMilliseconds = 60_000;
let worker: Worker | undefined;
let nextId = 0;
let disposed = false;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }>();

function deserialize(failure: FormatFailure): Error {
  const error = new Error(failure.message, failure.cause ? { cause: deserialize(failure.cause) } : undefined);
  error.name = failure.name;
  if (failure.stack) error.stack = failure.stack;
  return error;
}

function stop(error: Error): void {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timeout);
    request.reject(error);
  }
  pending.clear();
}

function start(): Worker {
  if (disposed) throw new Error("The formatter is closing. Reload the page before formatting.");
  if (worker) return worker;
  const active = new FormattingWorker({ name: "code-formatting" });
  worker = active;
  active.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const result = event.data;
    const request = pending.get(result.id);
    if (!request) return;
    clearTimeout(request.timeout);
    pending.delete(result.id);
    if ("error" in result) request.reject(deserialize(result.error));
    else request.resolve(result.value);
  });
  active.addEventListener("error", event => {
    if (worker === active) stop(new Error(event.message || "The formatter stopped unexpectedly.", { cause: event.error }));
  });
  active.addEventListener("messageerror", () => {
    if (worker === active) stop(new Error("The formatter response could not be read."));
  });
  return active;
}

/** Formatting is explicit and pure: callers decide whether a result is still applicable. */
export function formatDocument(request: FormatRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    try {
      const active = start();
      const timeout = setTimeout(() => stop(new Error("Formatting timed out. The formatter was stopped; the document was not changed.")), timeoutMilliseconds);
      pending.set(id, { resolve, reject, timeout });
      active.postMessage({ id, request });
    } catch (error) {
      const job = pending.get(id);
      if (job) clearTimeout(job.timeout);
      pending.delete(id);
      reject(error);
    }
  });
}

export function disposeFormatter(): void {
  stop(new Error("Formatting was cancelled because the formatter closed."));
}

import.meta.hot?.dispose(() => { disposed = true; disposeFormatter(); });

/** Compare pure sample formatting in a fresh worker; never touches editor state. */
export async function measureFormatter(request: FormatRequest, signal?: AbortSignal): Promise<{ coldMs: number; warmMs: number }> {
  const active = new FormattingWorker({ name: 'code-formatting-measurement' });
  let sequence = 0;
  let rejectActive: ((error: Error) => void) | undefined;
  const abort = () => { rejectActive?.(new Error('Formatter comparison cancelled.')); active.terminate(); };
  signal?.addEventListener('abort', abort, { once: true });
  async function sample(): Promise<number> {
    if (signal?.aborted) throw new Error('Formatter comparison cancelled.');
    return new Promise((resolve, reject) => {
      const id = ++sequence, start = performance.now();
      const cleanup = () => { clearTimeout(timer); active.removeEventListener('message', message); active.removeEventListener('error', failed); rejectActive = undefined; };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const message = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.id !== id) return;
        const result = event.data;
        if ('error' in result) fail(deserialize(result.error));
        else { const elapsed = performance.now() - start; cleanup(); resolve(elapsed); }
      };
      const failed = (event: ErrorEvent) => fail(new Error(event.message || 'The comparison worker failed.'));
      const timer = setTimeout(() => fail(new Error('Formatter comparison timed out.')), timeoutMilliseconds);
      rejectActive = fail;
      active.addEventListener('message', message); active.addEventListener('error', failed);
      active.postMessage({ id, request });
    });
  }
  try {
    const coldMs = await sample();
    const warm = [await sample(), await sample(), await sample()].sort((a,b) => a-b);
    return { coldMs, warmMs: warm[1]! };
  } finally { signal?.removeEventListener('abort', abort); active.terminate(); }
}
