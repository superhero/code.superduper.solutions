// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { ancestorDirectories, buildFileTree, previewFileTree, visibleFileTree } from "./file-tree.ts";

const paths = nodes => nodes.map(node => node.path);
const file = (name, path = name) => ({ name, path, kind: "file", children: [] });
const directory = (name, path, children) => ({ name, path, kind: "directory", children });

Then("the repository tree preserves nested Unicode paths and repeated basenames", function () {
  assert.deepEqual(buildFileTree(["README.md", "src/README.md", "résumé/日本語/README.md", "src/lib/main.ts"]), [
    directory("résumé", "résumé", [directory("日本語", "résumé/日本語", [file("README.md", "résumé/日本語/README.md")])]),
    directory("src", "src", [directory("lib", "src/lib", [file("main.ts", "src/lib/main.ts")]), file("README.md", "src/README.md")]),
    file("README.md"),
  ]);
});

Then("tree siblings sort by kind and natural name independently of input order", function () {
  const input = ["file10.ts", "folder10/z.ts", "file2.ts", "folder2/file10.ts", "folder2/folder10/z.ts",
    "folder2/file2.ts", "folder2/folder2/z.ts", "file1.ts"];
  const tree = buildFileTree(input);
  assert.deepEqual(paths(tree), ["folder2", "folder10", "file1.ts", "file2.ts", "file10.ts"]);
  assert.deepEqual(paths(tree[0].children), ["folder2/folder2", "folder2/folder10", "folder2/file2.ts", "folder2/file10.ts"]);
  assert.deepEqual(buildFileTree([...input].reverse()), tree);
});

Then("case accents and padded numbers retain distinct deterministically sorted names", function () {
  const input = ["résumé.txt", "item2.txt", "resume.txt", "item02.txt", "Résumé.txt", "a.txt", "A.txt"];
  const expected = ["A.txt", "a.txt", "item02.txt", "item2.txt", "Résumé.txt", "resume.txt", "résumé.txt"];
  assert.deepEqual(paths(buildFileTree(input)), expected);
  assert.deepEqual(paths(buildFileTree([...input].reverse())), expected);
});

Then("duplicate identical paths produce one tree leaf without changing the input", function () {
  const input = Object.freeze(["z.txt", "src/main.ts", "z.txt", "src/main.ts", "src/lib/util.ts"]);
  const before = [...input];
  const tree = buildFileTree(input);
  assert.deepEqual(input, before);
  assert.deepEqual(paths(visibleFileTree(tree, new Set(["src", "src/lib"]))),
    ["src", "src/lib", "src/lib/util.ts", "src/main.ts", "z.txt"]);
});

Then("the tree rejects a file-directory conflict with the {string} supplied first", function (order) {
  const input = order === "file" ? ["src", "src/main.ts"] : ["src/main.ts", "src"];
  assert.throws(() => buildFileTree(input), /file and directory share the path "src"/);
});

Then("empty file trees stay empty", function () {
  assert.deepEqual(buildFileTree([]), []);
  assert.deepEqual(visibleFileTree([], new Set(["absent"])), []);
});

Then("visible tree rows include only descendants whose ancestors are expanded", function () {
  const tree = buildFileTree(["README.md", "src/main.ts", "src/lib/deep/code.ts", "docs/index.md"]);
  const before = structuredClone(tree);
  const freeze = nodes => { for (const node of nodes) { freeze(node.children); Object.freeze(node); } Object.freeze(nodes); };
  freeze(tree);
  assert.deepEqual(paths(visibleFileTree(tree, new Set())), ["docs", "src", "README.md"]);
  assert.deepEqual(paths(visibleFileTree(tree, new Set(["src/lib", "src/lib/deep", "absent"]))), ["docs", "src", "README.md"]);
  const expanded = new Set(["src", "src/lib", "README.md"]);
  assert.deepEqual(paths(visibleFileTree(tree, expanded)), ["docs", "src", "src/lib", "src/lib/deep", "src/main.ts", "README.md"]);
  expanded.add("src/lib/deep"); expanded.add("docs");
  assert.deepEqual(paths(visibleFileTree(tree, expanded)),
    ["docs", "docs/index.md", "src", "src/lib", "src/lib/deep", "src/lib/deep/code.ts", "src/main.ts", "README.md"]);
  assert.deepEqual([...expanded], ["src", "src/lib", "README.md", "src/lib/deep", "docs"]);
  assert.deepEqual(tree, before);
  assert.equal(visibleFileTree(tree, expanded)[0], tree[0]);
});

Then("the ancestors of {string} are {string}", function (path, expected) {
  assert.deepEqual(ancestorDirectories(path), expected ? expected.split(",") : []);
});

Then("tree building and ancestor lookup reject unsafe paths", function () {
  for (const path of ["../escape", "src//file", "/absolute", ".git/config", "src\\file", "src/./file"]) {
    assert.throws(() => buildFileTree([path]));
    assert.throws(() => ancestorDirectories(path));
  }
});

Then("file drag previews use the same natural names and exact spelling order as real files", function () {
  const tree = buildFileTree(["folder/index.ts", "file10.ts", "file1.ts", "item2.ts"]);
  const preview = previewFileTree(tree, { path: "file2.ts", kind: "file" });
  assert.deepEqual(paths(preview), ["folder", "file1.ts", "file2.ts", "file10.ts", "item2.ts"]);
  assert.deepEqual(preview[2], { ...file("file2.ts"), preview: true });
  assert.deepEqual(paths(previewFileTree(tree, { path: "item02.ts", kind: "file" })),
    ["folder", "file1.ts", "file10.ts", "item02.ts", "item2.ts"]);
});

Then("a drag preview uses its full destination path inside existing directories", function () {
  const tree = buildFileTree(["src/lib/file10.ts", "src/lib/file1.ts", "src/index.ts"]);
  const preview = previewFileTree(tree, { path: "src/lib/file2.ts", kind: "file" });
  assert.deepEqual(paths(preview), ["src"]);
  assert.deepEqual(paths(preview[0].children), ["src/lib", "src/index.ts"]);
  assert.deepEqual(preview[0].children[0].children, [
    file("file1.ts", "src/lib/file1.ts"),
    { ...file("file2.ts", "src/lib/file2.ts"), preview: true },
    file("file10.ts", "src/lib/file10.ts"),
  ]);
});

Then("rendering a drag preview leaves the original tree unchanged and shares unaffected nodes", function () {
  const tree = buildFileTree(["docs/index.md", "src/lib/first.ts", "src/main.ts", "moving.ts"]);
  const before = structuredClone(tree);
  const freeze = nodes => { for (const node of nodes) { freeze(node.children); Object.freeze(node); } Object.freeze(nodes); };
  freeze(tree);
  const preview = previewFileTree(tree, { path: "src/lib/moving.ts", kind: "file" });
  assert.deepEqual(tree, before);
  assert.notEqual(preview, tree);
  assert.equal(preview[0], tree[0]);
  assert.equal(preview[2], tree[2]);
  assert.notEqual(preview[1], tree[1]);
  assert.notEqual(preview[1].children[0], tree[1].children[0]);
  assert.equal(preview[1].children[1], tree[1].children[1]);
  assert.equal(preview[1].children[0].children[0], tree[1].children[0].children[0]);
  assert.deepEqual(paths(visibleFileTree(tree, new Set(["src", "src/lib"]))),
    ["docs", "src", "src/lib", "src/lib/first.ts", "src/main.ts", "moving.ts"]);
});

Then("directory drag previews have no children and use normal directory ordering", function () {
  const tree = buildFileTree(["folder10/child.ts", "folder1/child.ts", "a.ts"]);
  const preview = previewFileTree(tree, { path: "folder2", kind: "directory" });
  assert.deepEqual(paths(preview), ["folder1", "folder2", "folder10", "a.ts"]);
  assert.deepEqual(preview[1], { ...directory("folder2", "folder2", []), preview: true });
});

Then("a {string} drag preview returns the original tree", function (destination) {
  const tree = buildFileTree(["src/lib/index.ts", "README.md"]);
  const previews = {
    "absent preview": null,
    "existing file": { path: "README.md", kind: "file" },
    "existing folder": { path: "src", kind: "file" },
    "nested collision": { path: "src/lib/index.ts", kind: "directory" },
    "missing parent": { path: "absent/file.ts", kind: "file" },
    "nested missing": { path: "src/absent/file.ts", kind: "file" },
    "file parent": { path: "README.md/file.ts", kind: "file" },
  };
  assert.equal(previewFileTree(tree, previews[destination]), tree);
});

Then("drag previews cannot introduce unsafe paths", function () {
  for (const path of ["../escape", "src//file", "/absolute", ".git/config", "src\\file", "src/./file"]) {
    assert.throws(() => previewFileTree([], { path, kind: "file" }));
  }
});
