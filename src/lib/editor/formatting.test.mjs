// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { EditorState } from "@codemirror/state";
import { formattingChanges } from "./formatting.ts";

Then("a formatting transaction preserves the selected identifier", () => {
  const source = "const value={x:1};\nconsole.log(value)";
  const target = "const value = { x: 1 };\nconsole.log(value);\n";
  const anchor = source.lastIndexOf("value");
  const state = EditorState.create({ doc: source, selection: { anchor, head: anchor + 5 } });
  const result = state.update({ changes: formattingChanges(state.doc, target) }).state;
  assert.equal(result.sliceDoc(), target);
  assert.equal(result.sliceDoc(result.selection.main.from, result.selection.main.to), "value");
});
Then("formatting normalized output retains the document line separator", () => {
  const state = EditorState.create({ doc: "const a=1;\r\nconst b=2;\r\n",
    extensions: [EditorState.lineSeparator.of("\r\n")] });
  const result = state.update({ changes: formattingChanges(state.doc, "const a = 1;\nconst b = 2;\n") }).state;
  assert.equal(result.doc.lines, 3);
  assert.equal(result.sliceDoc(), "const a = 1;\r\nconst b = 2;\r\n");
});
Then("identical formatting output produces no changes", () => {
  const state = EditorState.create({ doc: "const a = 1;\n" });
  assert.deepEqual(formattingChanges(state.doc, state.sliceDoc()), []);
});
