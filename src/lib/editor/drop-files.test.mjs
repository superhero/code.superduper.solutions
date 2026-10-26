// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { readDroppedFiles } from "./drop-files.ts";

function file(name, bytes = [1, 2, 3], relativePath = "") {
  return { name, webkitRelativePath: relativePath, arrayBuffer: async () => Uint8Array.from(bytes).buffer };
}

function entry(name, bytes = [1, 2, 3]) {
  return { name, isFile: true, isDirectory: false, file: resolve => queueMicrotask(() => resolve(file(name, bytes))) };
}

function folder(name, batches, onRead = () => {}) {
  return { name, isFile: false, isDirectory: true, createReader() {
    let index = 0;
    return { readEntries(resolve) { onRead(index); queueMicrotask(() => resolve(batches[index++] ?? [])); } };
  } };
}

const item = value => ({ kind: "file", webkitGetAsEntry: () => value, getAsFile: () => null });

Then("dropped entries retain their complete hierarchy and original bytes", async function () {
  const files = await readDroppedFiles({ items: [item(folder("résumé", [[
    folder("日本語", [[entry("image.bin", [0, 255, 128, 10])]]), entry(".hidden", []), folder("empty", []),
  ]])), item(entry("notes.txt", [65, 13, 10]))] });
  assert.deepEqual(files, [
    { path: "résumé/日本語/image.bin", data: new Uint8Array([0, 255, 128, 10]) },
    { path: "résumé/.hidden", data: new Uint8Array() },
    { path: "notes.txt", data: new Uint8Array([65, 13, 10]) },
  ]);
});

Then("a dropped folder with 101 entries is read until the empty batch", async function () {
  const entries = Array.from({ length: 101 }, (_, index) => entry(`${index}.bin`, [index]));
  const reads = [];
  const files = await readDroppedFiles({ items: [item(folder("many", [entries.slice(0, 100), entries.slice(100)], index => reads.push(index)))] });
  assert.deepEqual(reads, [0, 1, 2]);
  assert.equal(files.length, 101);
  assert.deepEqual(files[100], { path: "many/100.bin", data: new Uint8Array([100]) });
});

Then("the drop adapter captures all {string} entries before asynchronous traversal", async function (method) {
  let accessible = true;
  let captured = 0;
  const items = [folder("first", [[entry("one.txt")]]), entry("two.txt")].map(value => ({
    kind: "file", [method]() { assert.ok(accessible); captured++; return value; },
    getAsFile() { assert.fail("Entry-supported browsers do not need a fallback file."); },
  }));
  const pending = readDroppedFiles({ items });
  assert.equal(captured, 2);
  accessible = false;
  assert.deepEqual((await pending).map(value => value.path), ["first/one.txt", "two.txt"]);
});

Then("dropped item files are captured together before their bytes are read", async function () {
  let accessible = true;
  let captured = 0;
  const items = [file("first.bin"), file("second.bin")].map(value => ({
    kind: "file", getAsEntry: () => null, webkitGetAsEntry: () => null,
    getAsFile() { assert.ok(accessible); captured++; return value; },
  }));
  items.unshift({ kind: "string", getAsFile() { assert.fail("Text items are ignored."); } });
  const pending = readDroppedFiles({ items, files: [file("duplicate.bin")] });
  assert.equal(captured, 2);
  accessible = false;
  assert.deepEqual((await pending).map(value => value.path), ["first.bin", "second.bin"]);
});

Then("the drop adapter accepts FileList fallback paths without losing bytes", async function () {
  const transfer = { files: [file("asset.bin", [255, 0], "root/asset.bin"), file("plain.txt", [65])] };
  const pending = readDroppedFiles(transfer);
  transfer.files = [];
  assert.deepEqual(await pending, [
    { path: "root/asset.bin", data: new Uint8Array([255, 0]) },
    { path: "plain.txt", data: new Uint8Array([65]) },
  ]);
  const unprefixed = { kind: "file", getAsFile: () => file("fallback.txt") };
  assert.equal((await readDroppedFiles({ items: [unprefixed] }))[0].path, "fallback.txt");
});

Then("a dropped {string} failure returns no partial file list", async function (failure) {
  const cause = new Error("Cannot read dropped data");
  let broken;
  if (failure === "file callback") broken = item({ ...entry("broken.txt"), file: (_resolve, reject) => reject(cause) });
  else if (failure === "folder callback") broken = item({ ...folder("broken", []), createReader: () => ({ readEntries: (_resolve, reject) => reject(cause) }) });
  else if (failure === "file bytes") broken = { kind: "file", getAsFile: () => ({ ...file("broken.txt"), arrayBuffer: async () => { throw cause; } }) };
  else if (failure === "entry capture") broken = { ...item(null), webkitGetAsEntry() { throw cause; } };
  else broken = item(null);
  const pending = readDroppedFiles({ items: [item(entry("readable.txt")), broken] });
  await assert.rejects(pending, failure === "unavailable file" ? /could not read a dropped file or folder/ : error => error === cause);
});

Then("unsupported dropped entries reject the complete drop", async function () {
  for (const unsupported of [
    { name: "unknown", isFile: false, isDirectory: false },
    { name: "no-file-reader", isFile: true, isDirectory: false },
    { name: "no-folder-reader", isFile: false, isDirectory: true },
  ]) await assert.rejects(readDroppedFiles({ items: [item(unsupported)] }), /cannot read the dropped entry/);
});

Then("dropped entries and fallback files reject unsafe paths", async function () {
  for (const name of ["..", ".", "", "bad\\name", "bad\0name"]) {
    await assert.rejects(readDroppedFiles({ items: [item(entry(name))] }));
  }
  await assert.rejects(readDroppedFiles({ items: [item(entry("path/inside"))] }), /path separators/);
  for (const path of ["../outside", "/absolute", "empty//name", "dot/./name", "bad\\name", "bad\0name"]) {
    await assert.rejects(readDroppedFiles({ files: [file("safe.txt", [1], path)] }));
  }
});

Then("dropped Git metadata is rejected with history-preserving import guidance", async function () {
  for (const value of [entry(".git"), folder(".git", []), folder("root", [[folder(".GIT", [])]])]) {
    await assert.rejects(readDroppedFiles({ items: [item(value)] }), /Use Import repository.*whole Git repository with its history/);
  }
  await assert.rejects(readDroppedFiles({ files: [file("HEAD", [1], "root/.git/HEAD")] }), /Use Import repository/);
});

Then("drops without files explain that empty folders are not versioned", async function () {
  for (const transfer of [{}, { items: [], files: [] }, { items: [{ kind: "string" }] }, { items: [item(folder("empty", []))] }]) {
    await assert.rejects(readDroppedFiles(transfer), /No files were dropped.*Empty folders are not stored in Git history/);
  }
});
