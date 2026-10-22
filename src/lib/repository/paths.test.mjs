// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { decodeText, encodeText, filePath, repositoryPaths } from "./paths.ts";

Then("repository file path {string} is accepted unchanged", function (path) { assert.equal(filePath(path), path); });
Then("the {string} repository file path is rejected", function (name) {
  const cases = { empty: "", "non-string": null, absolute: "/README.md", backslash: "src\\file.ts", NUL: "a\0b",
    newline: "a\nb", DEL: "a\x7fb", dot: ".", parent: "..", "inner parent": "src/../secret", "repeated slash": "src//file",
    "trailing slash": "src/", "git directory": ".git", "git metadata": ".git/config", "mixed-case Git": ".GiT/config", "nested Git": "src/.git/config" };
  assert.throws(() => filePath(cases[name]), /relative file path|File paths cannot|Git metadata cannot/);
});
Then("only root Git metadata paths are accepted for imports", function () {
  assert.equal(filePath(".git/config", true), ".git/config");
  assert.equal(filePath(".git/objects/ab/123", true), ".git/objects/ab/123");
});
Then("the imported path {string} explains {string}", function (path, explanation) {
  assert.throws(() => filePath(path, true), error => error.message.includes(`"${path}"`) && error.message.includes(explanation));
});
Then("stable repository identities produce separate source and history paths", function () {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.deepEqual(repositoryPaths(id), { dir: `/repositories/${id}`, gitdir: `/repositories/${id}/.git`, historyGitdir: `/history/${id}` });
  assert.equal(repositoryPaths(id, "/fixture").dir, `/fixture/repositories/${id}`);
  assert.throws(() => repositoryPaths("../other"), /Invalid repository identifier/);
});
Then("UTF-8 text round trips without changing its bytes", function () {
  const text = "\ufeffconst 日本語 = 'résumé';\r\n";
  const encoded = encodeText(text);
  assert.deepEqual([...encoded.slice(0, 3)], [239, 187, 191]);
  assert.equal(decodeText(encoded), text);
  assert.deepEqual(encodeText(decodeText(encoded)), encoded);
  assert.equal(decodeText(new Uint8Array()), "");
});
Then("the {string} byte sequence is rejected by text reading", function (name) {
  const bytes = name === "NUL" ? new Uint8Array([65, 0, 66]) : new Uint8Array([0xff, 0xfe, 65]);
  const original = bytes.slice();
  assert.throws(() => decodeText(bytes), /bytes are preserved/);
  assert.deepEqual(bytes, original);
});
Then("the {string} text write is rejected", function (name) {
  assert.throws(() => encodeText(name === "NUL" ? "a\0b" : null), /Text edits cannot/);
});
