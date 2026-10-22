// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

/** Compact elapsed time: milliseconds below 5s, seconds below 1h. */
export function formatGenerationDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) throw new RangeError('Invalid generation duration.');
  const elapsed = Math.max(0, Math.floor(milliseconds));
  const units: [number, string][] = [[86400000, 'd'], [3600000, 'h'], [60000, 'm']];
  if (elapsed < 3600000) units.push([1000, 's']);
  if (elapsed < 5000) units.push([1, 'ms']);
  let remaining = elapsed;
  const parts: string[] = [];
  for (const [size, unit] of units) {
    const value = Math.floor(remaining / size);
    if (value) parts.push(`${value}${unit}`);
    remaining %= size;
  }
  return parts.join(' ') || '0ms';
}
