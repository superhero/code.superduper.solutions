// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

export type LineRange = { from: number; to: number };

type Window = { a: number; endA: number; b: number; endB: number };

// Keep terminators on their lines: an EOF newline edit changes the final real
// line, without manufacturing an extra empty line after every trailing newline.
function lines(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
}

function append(ranges: LineRange[], start: number, end: number): void {
  if (start === end) return;
  const previous = ranges.at(-1);
  if (previous?.to === start) previous.to = end;
  else ranges.push({ from: start + 1, to: end });
}

// Bidirectional Myers search finds a point on a shortest edit path using two
// frontiers, rather than retaining a quadratic table or every search frontier.
function bisect(before: string[], after: string[], window: Window): [number, number] {
  const { a, endA, b, endB } = window;
  const n = endA - a, m = endB - b;
  const distance = Math.ceil((n + m) / 2), offset = distance + 1;
  const forward = new Int32Array(2 * distance + 3).fill(-1);
  const reverse = new Int32Array(forward.length).fill(-1);
  forward[offset + 1] = reverse[offset + 1] = 0;
  const delta = n - m, odd = delta % 2 !== 0;
  let forwardStart = 0, forwardEnd = 0, reverseStart = 0, reverseEnd = 0;

  let split: [number, number];
  // The frontiers must meet by ceil((n + m) / 2), even when every line changes.
  search: for (let d = 0; ; d++) {
    for (let k = -d + forwardStart; k <= d - forwardEnd; k += 2) {
      const index = offset + k;
      let x = k === -d || (k !== d && forward[index - 1]! < forward[index + 1]!)
        ? forward[index + 1]! : forward[index - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && before[a + x] === after[b + y]) { x++; y++; }
      forward[index] = x;
      if (x > n) forwardEnd += 2;
      else if (y > m) forwardStart += 2;
      else if (odd) {
        const other = offset + delta - k;
        if (other >= 0 && other < reverse.length && reverse[other] !== -1 && x >= n - reverse[other]!) {
          split = [a + x, b + y];
          break search;
        }
      }
    }
    for (let k = -d + reverseStart; k <= d - reverseEnd; k += 2) {
      const index = offset + k;
      let x = k === -d || (k !== d && reverse[index - 1]! < reverse[index + 1]!)
        ? reverse[index + 1]! : reverse[index - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && before[endA - x - 1] === after[endB - y - 1]) { x++; y++; }
      reverse[index] = x;
      if (x > n) reverseEnd += 2;
      else if (y > m) reverseStart += 2;
      else if (!odd) {
        const other = offset + delta - k;
        if (other >= 0 && other < forward.length && forward[other] !== -1 && forward[other]! >= n - x) {
          const x = forward[other]!;
          split = [a + x, b + x - delta + k];
          break search;
        }
      }
    }
  }
  return split;
}

/** Changed real lines, with 1-based inclusive ranges on each side of the edit. */
export function changedLineRanges(beforeText: string, afterText: string): { before: LineRange[]; after: LineRange[] } {
  const result: { before: LineRange[]; after: LineRange[] } = { before: [], after: [] };
  if (beforeText === afterText) return result;
  const before = lines(beforeText), after = lines(afterText);
  const pending: Window[] = [{ a: 0, endA: before.length, b: 0, endB: after.length }];

  while (pending.length) {
    const window = pending.pop()!;
    let { a, endA, b, endB } = window;
    while (a < endA && b < endB && before[a] === after[b]) { a++; b++; }
    while (a < endA && b < endB && before[endA - 1] === after[endB - 1]) { endA--; endB--; }
    if (a === endA || b === endB) {
      append(result.before, a, endA);
      append(result.after, b, endB);
      continue;
    }

    // Completely different blocks need no search. This also bounds replacement
    // cost for large generated files whose lines have nothing in common.
    const candidates = new Set(before.slice(a, endA));
    let match = b;
    while (match < endB && !candidates.has(after[match]!)) match++;
    if (match === endB) {
      append(result.before, a, endA);
      append(result.after, b, endB);
      continue;
    }
    if (endA - a === 1) {
      append(result.after, b, match);
      append(result.after, match + 1, endB);
      continue;
    }
    if (endB - b === 1) {
      const matched = before.indexOf(after[b]!, a);
      append(result.before, a, matched);
      append(result.before, matched + 1, endA);
      continue;
    }

    const [splitA, splitB] = bisect(before, after, { a, endA, b, endB });
    // Visit left first to keep ranges ordered, without a recursion depth limit.
    pending.push({ a: splitA, endA, b: splitB, endB });
    pending.push({ a, endA: splitA, b, endB: splitB });
  }
  return result;
}
