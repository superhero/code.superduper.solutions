// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Transaction } from "@codemirror/state";
import type { EditGroup } from "../repository/types.ts";

/** The real row changed by a replacement that neither adds nor removes a line. */
export function singleEditedLine(before: string, after: string): number | undefined {
  let from = 0, endBefore = before.length, endAfter = after.length;
  while (from < endBefore && from < endAfter && before[from] === after[from]) from++;
  if (from === endBefore && from === endAfter) return undefined;
  while (endBefore > from && endAfter > from && before[endBefore - 1] === after[endAfter - 1]) { endBefore--; endAfter--; }
  if (/[\r\n]/.test(before.slice(from, endBefore)) || /[\r\n]/.test(after.slice(from, endAfter))) return undefined;
  return before.slice(0, from).split(/\r\n?|\n/).length;
}

/** Group adjacent ordinary typing/deletion; storage still acknowledges every edit. */
export class EditGrouping {
  private previous: { document: string; group: EditGroup; head: number; time: number } | undefined;
  reset(): void { this.previous = undefined; }
  next(transaction: Transaction, document: string, time = performance.now()): EditGroup | undefined {
    const before = transaction.startState, after = transaction.state;
    if (!transaction.docChanged || !["input.type", "delete.backward", "delete.forward"].some(event => transaction.isUserEvent(event)) ||
      before.selection.ranges.length !== 1 || after.selection.ranges.length !== 1 || !before.selection.main.empty || !after.selection.main.empty) {
      this.reset(); return undefined;
    }
    let line: number | undefined, count = 0;
    transaction.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
      count++;
      const row = before.doc.lineAt(fromA);
      if (toA <= row.to && inserted.lines === 1) line = row.number;
    });
    if (count !== 1 || line === undefined) { this.reset(); return undefined; }
    const previous = this.previous;
    const group = previous?.document === document && previous.group.line === line && previous.head === before.selection.main.head &&
      time >= previous.time && time - previous.time < 1500 ? previous.group : { id: crypto.randomUUID(), line };
    this.previous = { document, group, head: after.selection.main.head, time };
    return group;
  }
}
