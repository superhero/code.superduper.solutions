// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { attachGitDirectory, gitDirectoryLink } from "./import.ts";

const file = (path, content) => ({ path, data: typeof content === "string" ? new TextEncoder().encode(content) : content });
const link = () => file(".git", "gitdir: ../../.git/modules/src/mt5-eventbus\n");
const head = () => file("HEAD", "ref: refs/heads/main\n");

Then("importing {string} finds no Git directory link", function (kind) {
  const files = {
    "an empty directory": [],
    "ordinary working files": [file(".gitignore", "ignored"), file("src/main.ts", "text")],
    "a complete Git directory": [file(".git/HEAD", "ref: refs/heads/main\n")],
    "nested Git links": [file("nested/.git", "gitdir: elsewhere\n")],
  }[kind];
  assert.equal(gitDirectoryLink(files), null);
});

Then("the {string} Git directory link retains its path without accessing it", function (kind) {
  const [path, ending] = {
    "relative submodule": ["../../.git/modules/src/mt5-eventbus", "\n"],
    "absolute Unix": ["/not-accessible/from-the-browser/.git", "\n"],
    "absolute Windows": ["C:\\Users\\Erik\\repository\\.git", "\n"],
    "spaces and Unicode": ["../références 日本語/repository metadata", "\n"],
    "CRLF ending": ["../metadata", "\r\n"],
    "no newline": ["../metadata", ""],
  }[kind];
  const input = [file("README.md", "unchanged"), file(".git", `gitdir: ${path}${ending}`)];
  const before = structuredClone(input);
  assert.equal(gitDirectoryLink(input), path);
  assert.deepEqual(input, before);
});

Then("the {string} Git directory link is rejected with an actionable error", function (kind) {
  const input = kind === "duplicate link" ? [link(), link()] : [file(".git", {
    "missing prefix": "../metadata\n",
    "empty path": "gitdir: \n",
    "whitespace path": "gitdir:   \n",
    "multiple lines": "gitdir: ../metadata\nother\n",
    "extra final newline": "gitdir: ../metadata\n\n",
    "carriage return": "gitdir: ../meta\rdata\n",
    "tab": "gitdir: ../meta\tdata\n",
    "DEL": "gitdir: ../meta\x7fdata\n",
    "binary NUL": "gitdir: ../meta\0data\n",
    "invalid UTF-8": new Uint8Array([0xff, 0xfe]),
  }[kind])];
  const before = structuredClone(input);
  assert.throws(() => gitDirectoryLink(input), /\.git.*Select|\.git.*select/);
  assert.deepEqual(input, before);
});

Then("attaching Git metadata preserves working changes, binary objects, refs and the index", function () {
  const working = [file("src/main.ts", "uncommitted change\n"), link(), file("image.bin", new Uint8Array([0, 255, 1]))];
  const metadata = [head(), file("config", "[core]\n\tbare = false\n"),
    file("objects/pack/pack-example.pack", new Uint8Array([0, 255, 3, 2, 1])),
    file("index", new Uint8Array([68, 73, 82, 67, 0])), file("refs/heads/topic", "a".repeat(40)),
    file("refs/tags/v1", "b".repeat(40)), file("logs/HEAD", "reflog\n")];
  const beforeWorking = structuredClone(working); const beforeMetadata = structuredClone(metadata);
  const attached = attachGitDirectory(working, metadata);
  assert.deepEqual(attached, [...beforeWorking.filter(item => item.path !== ".git"),
    ...beforeMetadata.map(item => ({ ...item, path: `.git/${item.path}` }))]);
  assert.deepEqual(working, beforeWorking); assert.deepEqual(metadata, beforeMetadata);
  assert.equal(gitDirectoryLink(attached), null);
  assert.equal(attached.some(item => item.path === ".git"), false);
});

Then("attaching the {string} Git metadata selection is rejected", function (kind) {
  let working = [link(), file("README.md", "unchanged")]; let metadata = [head()];
  let message;
  if (kind === "absent Git link") { working = []; message = /does not contain a \.git directory link/; }
  else if (kind === "malformed Git link") { working = [file(".git", "invalid")]; message = /must contain a UTF-8 Git directory link/; }
  else if (kind === "existing Git metadata") { working.push(file(".git/config", "original")); message = /both a \.git link and Git metadata/; }
  else if (kind === "missing HEAD") { metadata = []; message = /no HEAD file/; }
  else if (kind === "repository instead of metadata") { metadata = [file(".git/HEAD", "ref: refs/heads/main\n")]; message = /no HEAD file/; }
  else if (kind === "duplicate metadata") { metadata.push(head()); message = /duplicate Git metadata/; }
  else {
    const path = { traversal: "../outside", "absolute metadata path": "/outside", backslash: "objects\\outside",
      "empty metadata path": "", "nested Git metadata": "modules/nested/.git/HEAD" }[kind];
    metadata.push(file(path, "unsafe")); message = /relative file path|File paths cannot|another \.git path/;
  }
  const beforeWorking = structuredClone(working); const beforeMetadata = structuredClone(metadata);
  assert.throws(() => attachGitDirectory(working, metadata), message);
  assert.deepEqual(working, beforeWorking); assert.deepEqual(metadata, beforeMetadata);
});

Then("attaching Git metadata retains duplicate working files without overwriting them", function () {
  const files = [file("duplicate", "first"), link(), file("duplicate", "second")];
  const attached = attachGitDirectory(files, [head()]);
  assert.deepEqual(attached.slice(0, 2), [files[0], files[2]]);
});
