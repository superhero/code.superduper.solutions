// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { diff } from "@codemirror/merge";
import { Text, type ChangeSpec } from "@codemirror/state";

export interface FormattingSnapshot {
  documentId: string;
  generation: number;
  text: string;
}

/** Diff in CodeMirror's newline-normalized coordinates, retaining unchanged selections. */
export function formattingChanges(document: Text, formatted: string): ChangeSpec[] {
  const normalized = formatted.replace(/\r\n?/g, "\n");
  return diff(document.toString(), normalized, { scanLimit: 10_000, timeout: 100 }).map(change => ({
    from: change.fromA, to: change.toA,
    insert: Text.of(normalized.slice(change.fromB, change.toB).split("\n"))
  }));
}
