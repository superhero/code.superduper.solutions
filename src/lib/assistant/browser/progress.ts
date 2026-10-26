// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Progress } from './types.ts';

/** Translate native byte/tensor events into the editor's progress contract. */
export function modelProgress(value: unknown): Progress {
  const event = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const message = typeof event.message === 'string' ? event.message : 'Loading model…';
  const received = event.received ?? event.loaded;
  if (typeof event.total !== 'number' || !Number.isFinite(event.total) || event.total <= 0 ||
    typeof received !== 'number' || !Number.isFinite(received) || received < 0) return { message };
  return { message, received: Math.min(received, event.total), total: event.total,
    unit: event.kind === 'tensors' || event.unit === 'tensors' ? 'tensors' : 'bytes' };
}
