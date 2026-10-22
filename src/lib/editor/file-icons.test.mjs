// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { fileIcon } from "./file-icons.ts";

Then("these repository paths use their Devicon glyphs:", function (table) {
  for (const { path, icon } of table.hashes()) {
    const result = fileIcon(path);
    assert.equal(result.kind, "devicon", path);
    assert.equal(result.name, icon, path);
    assert.equal([...result.glyph].length, 1, `${path} must use one font glyph`);
    assert.ok(result.glyph.codePointAt(0) >= 0xe000, `${path} must use the icon font's private-use range`);
  }
});

Then("these repository paths use their Material icons:", function (table) {
  for (const { path, icon } of table.hashes()) {
    assert.deepEqual(fileIcon(path), { kind: "material", name: icon }, path);
  }
});

Then("a file renamed from TypeScript to Python to an unknown type changes its icon each time", function () {
  assert.equal(fileIcon("src/main.ts").name, "typescript-plain");
  assert.equal(fileIcon("src/main.py").name, "python-plain");
  assert.deepEqual(fileIcon("src/main.unknown"), { kind: "material", name: "code" });
});
