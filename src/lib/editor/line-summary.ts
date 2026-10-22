// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { FileChange } from "../repository/types";

export function changedLines(change: FileChange): string {
  if (change.binary) return "binary change";
  const count = (lines: FileChange["before"]) => lines.reduce((total, { from, to }) => total + to - from + 1, 0);
  const beforeCount = count(change.before), afterCount = count(change.after);
  if (Math.max(beforeCount, afterCount) > 10) {
    if (!beforeCount) return `${afterCount} lines added`;
    if (!afterCount) return `${beforeCount} lines deleted`;
    return beforeCount === afterCount ? `${afterCount} lines edited`
      : `${beforeCount} line${beforeCount === 1 ? "" : "s"} → ${afterCount} line${afterCount === 1 ? "" : "s"} edited`;
  }
  const ranges = (lines: FileChange["before"]) => lines.map(({ from, to }) => from === to ? String(from) : `${from}–${to}`).join(", ");
  const before = ranges(change.before);
  const after = ranges(change.after);
  const label = (value: string) => `line${/^\d+$/.test(value) ? "" : "s"} ${value}`;
  if (before === after) return after ? label(after) : "";
  if (!before) return `added ${label(after)}`;
  if (!after) return `deleted ${label(before)}`;
  return `lines ${before} → ${after}`;
}

