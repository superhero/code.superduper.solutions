// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { StartupEvent, StartupItem, StartupStatus } from "../startup-progress.ts";

export type RepositoryProgress = (event: StartupEvent) => void;

/** Presentation observers must never interrupt a durable repository operation. */
export function reportProgress(listener: RepositoryProgress | undefined, item: StartupItem, status: StartupStatus): void {
  try { listener?.({ item, status }); } catch { /* Progress is advisory; storage remains authoritative. */ }
}

export async function trackProgress<T>(listener: RepositoryProgress | undefined, item: StartupItem, task: () => Promise<T>): Promise<T> {
  reportProgress(listener, item, "running");
  try {
    const value = await task();
    reportProgress(listener, item, "complete");
    return value;
  } catch (error) {
    reportProgress(listener, item, "error");
    throw error;
  }
}
