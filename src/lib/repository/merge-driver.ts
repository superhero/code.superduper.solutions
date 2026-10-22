// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import diff3 from "diff3";
import type { MergeDriverCallback } from "isomorphic-git";

/** Keep non-text files in conflict; their actual blobs remain in index stages. */
export const mergeDriver: MergeDriverCallback = ({ contents }) => {
  if (contents.some(value => value.includes("\0") || value.includes("\ufffd")))
    return { cleanMerge: false, mergedText: contents[1] ?? "" };
  const lines = (value: string) => value.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let mergedText = "", cleanMerge = true;
  for (const block of diff3(lines(contents[1]!), lines(contents[0]!), lines(contents[2]!))) {
    if (block.ok) mergedText += block.ok.join("");
    if (block.conflict) {
      cleanMerge = false;
      const current = block.conflict.a.join(""), incoming = block.conflict.b.join("");
      mergedText += `<<<<<<< Current\n${current}${current && !current.endsWith("\n") ? "\n" : ""}=======\n${incoming}${incoming && !incoming.endsWith("\n") ? "\n" : ""}>>>>>>> Incoming\n`;
    }
  }
  return { mergedText, cleanMerge };
};
