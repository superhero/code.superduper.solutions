// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

type Job = { run(): Promise<unknown>; resolve(value: unknown): void; reject(error: unknown): void; signal: AbortSignal | undefined; abort(): void };

/** One owner through loading, generation, tools and cleanup; cancelled waiters never run. */
export class BrowserWorkQueue {
  private active = false;
  private waiting: Job[] = [];
  private changed: () => void;
  constructor(changed: () => void = () => {}) { this.changed = changed; }
  get busy() { return this.active || this.waiting.length > 0; }
  run<T>(run: () => Promise<T>, signal?: AbortSignal, onQueued?: () => void): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const job: Job = { run, resolve: value => resolve(value as T), reject, signal, abort: () => {
        this.waiting = this.waiting.filter(item => item !== job);
        reject(signal!.reason); this.changed();
      } };
      if (this.busy) onQueued?.();
      signal?.addEventListener('abort', job.abort, { once: true });
      this.waiting.push(job);
      void this.drain();
    });
  }
  private async drain() {
    if (this.active) return;
    this.active = true; this.changed();
    try {
      let job: Job | undefined;
      while ((job = this.waiting.shift())) {
        job.signal?.removeEventListener('abort', job.abort);
        try { job.signal?.throwIfAborted(); job.resolve(await job.run()); }
        catch (error) { job.reject(error); }
      }
    } finally { this.active = false; this.changed(); }
  }
}
