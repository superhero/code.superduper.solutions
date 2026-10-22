// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { changedLineRanges } from "./line-changes.ts";

const range = (from, to = from) => ({ from, to });
const text = lines => lines.map(line => `${line}\n`).join("");
const untouched = (lines, ranges) => lines.filter((_, index) => !ranges.some(({ from, to }) => index + 1 >= from && index + 1 <= to));
const count = ranges => ranges.reduce((total, { from, to }) => total + to - from + 1, 0);

Then("unchanged file contents have no changed line ranges", function () {
  for (const value of ["", "first", "first\n", "\n\n", "first\r\nsecond\r\n"])
    assert.deepEqual(changedLineRanges(value, value), { before: [], after: [] });
});

Then("separate line replacements remain separate changed ranges", function () {
  assert.deepEqual(changedLineRanges("one\ntwo\nthree\nfour\nfive\n", "one\nTWO\nthree\nFOUR\nfive\n"), {
    before: [range(2), range(4)], after: [range(2), range(4)],
  });
  assert.deepEqual(changedLineRanges("one\ntwo\nthree\nfour\n", "one\nTWO\nTHREE\nfour\n"), {
    before: [range(2, 3)], after: [range(2, 3)],
  });
});

Then("added and removed lines belong only to their respective revision", function () {
  assert.deepEqual(changedLineRanges("a\nb\nc\nd\n", "new\na\nb\nc\n"), {
    before: [range(4)], after: [range(1)],
  });
  assert.deepEqual(changedLineRanges("a\nb\n", "a\nnew\nb\n"), { before: [], after: [range(2)] });
  assert.deepEqual(changedLineRanges("a\nold\nb\n", "a\nb\n"), { before: [range(2)], after: [] });
  assert.deepEqual(changedLineRanges("anchor\n", "left\nanchor\nright\n"), { before: [], after: [range(1), range(3)] });
  assert.deepEqual(changedLineRanges("left\nanchor\nright\n", "anchor\n"), { before: [range(1), range(3)], after: [] });
});

Then("empty files and EOF newline edits report only real lines", function () {
  assert.deepEqual(changedLineRanges("", "one\ntwo\n"), { before: [], after: [range(1, 2)] });
  assert.deepEqual(changedLineRanges("one\ntwo\n", ""), { before: [range(1, 2)], after: [] });
  assert.deepEqual(changedLineRanges("", "\n"), { before: [], after: [range(1)] });
  assert.deepEqual(changedLineRanges("one\ntwo", "one\ntwo\n"), { before: [range(2)], after: [range(2)] });
  assert.deepEqual(changedLineRanges("one\ntwo\n", "one\ntwo"), { before: [range(2)], after: [range(2)] });
  assert.deepEqual(changedLineRanges("one\n", "one\n\n"), { before: [], after: [range(2)] });
});

Then("CRLF, lone CR and Unicode changes have accurate line ranges", function () {
  assert.deepEqual(changedLineRanges("résumé\r\n日本語\r\nlast\r\n", "résumé\r\n変更\r\nlast\r\n"), {
    before: [range(2)], after: [range(2)],
  });
  assert.deepEqual(changedLineRanges("a\r\nb\r\n", "a\nb\n"), { before: [range(1, 2)], after: [range(1, 2)] });
  assert.deepEqual(changedLineRanges("a\rb\rc\r", "a\rB\rc\r"), { before: [range(2)], after: [range(2)] });
  assert.deepEqual(changedLineRanges("a\rb", "a\rb\r"), { before: [range(2)], after: [range(2)] });
  assert.deepEqual(changedLineRanges("a\rb\r", "a\r\nb\r\n"), { before: [range(1, 2)], after: [range(1, 2)] });
});

Then("repeated line edits preserve the maximum unchanged lines", function () {
  // A small exhaustive independent LCS oracle checks ambiguous repeated lines,
  // both frontier overlap cases, and correct reconstruction of unchanged rows.
  const sequences = [[]];
  for (let length = 1; length <= 6; length++)
    for (let mask = 0; mask < 2 ** length; mask++)
      sequences.push(Array.from({ length }, (_, i) => mask & 2 ** i ? "a" : "b"));
  for (const before of sequences) for (const after of sequences) {
    const lcs = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
    for (let i = 1; i <= before.length; i++) for (let j = 1; j <= after.length; j++)
      lcs[i][j] = before[i - 1] === after[j - 1] ? lcs[i - 1][j - 1] + 1 : Math.max(lcs[i - 1][j], lcs[i][j - 1]);
    const changed = changedLineRanges(text(before), text(after));
    assert.deepEqual(untouched(before, changed.before), untouched(after, changed.after));
    assert.equal(count(changed.before) + count(changed.after), before.length + after.length - 2 * lcs[before.length][after.length]);
  }
});

Then("sparse edits in a large file remain distinct without a quadratic table", function () {
  const before = Array.from({ length: 50000 }, (_, index) => `line ${index + 1}`);
  const after = [...before];
  after[1] = "changed near start";
  after[24999] = "changed in middle";
  after[49998] = "changed near end";
  assert.deepEqual(changedLineRanges(text(before), text(after)), {
    before: [range(2), range(25000), range(49999)], after: [range(2), range(25000), range(49999)],
  });
  assert.deepEqual(changedLineRanges(text(before), text(before.map(line => `replacement ${line}`))), {
    before: [range(1, 50000)], after: [range(1, 50000)],
  });
});
