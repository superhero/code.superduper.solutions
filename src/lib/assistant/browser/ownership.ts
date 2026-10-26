// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

/** Releasing a lease waits until Web Locks has actually relinquished ownership. */
export async function browserLease(name: string, signal?: AbortSignal, locks = globalThis.navigator?.locks): Promise<() => Promise<void>> {
  if (!locks) throw new Error('Browser inference requires Web Locks in a secure page.');
  signal?.throwIfAborted();
  let release!: () => void, acquired!: () => void, failed!: (error: unknown) => void;
  const held = new Promise<void>(resolve => release = resolve);
  const granted = new Promise<void>((resolve, reject) => { acquired = resolve; failed = reject; });
  const completed = locks.request(name, signal ? { signal } : {}, async () => { acquired(); await held; });
  void completed.catch(failed);
  await granted;
  return async () => { release(); await completed; };
}
