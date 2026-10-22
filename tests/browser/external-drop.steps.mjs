// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { repositorySelector } from "./navigation.helpers.mjs";

const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved", { timeout: 20_000 });
const treeItem = (page, path) => page.getByRole("tree", { name: "Repository files", exact: true })
  .getByRole("treeitem", { name: path, exact: true });
const binary = Buffer.from([0, 255, 128, 13, 10, 1, 254, 42]);

// Read the flushed LightningFS store without loading another filesystem instance
// or acquiring its write cache. Include ordinary .git bytes to detect changes to
// refs, index, and objects as well as source history visible in the interface.
async function persistedRepositoryFiles(page) {
  const id = await repositorySelector(page).getAttribute("data-value");
  assert.ok(id);
  return page.evaluate(async repositoryId => {
    const requestValue = request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const opening = indexedDB.open("v1/repositories");
    opening.onupgradeneeded = () => opening.transaction.abort();
    const database = await requestValue(opening);
    try {
      const transaction = database.transaction("v1/repositories_files", "readonly");
      const store = transaction.objectStore("v1/repositories_files");
      const root = await requestValue(store.get("!root"));
      const repository = root.get("/").get("repositories").get(repositoryId);
      const pending = [];
      function visit(directory, prefix = "") {
        for (const [name, child] of directory) {
          if (name === 0) continue;
          const path = `${prefix}${name}`;
          const stat = child.get(0);
          if (stat.type === "dir") visit(child, `${path}/`);
          else pending.push(requestValue(store.get(stat.ino)).then(bytes => [path, Array.from(bytes)]));
        }
      }
      visit(repository);
      return Object.fromEntries(await Promise.all(pending));
    } finally { database.close(); }
  }, id);
}

Given("the desktop {string} drop fixture is ready", async function (kind) {
  const fixtures = {
    files: { "notes.txt": "Desktop notes\n", "readme.md": "# Dropped files\n", "pixels.bin": binary },
    directory: { "desktop bundle/README.md": "Nested desktop directory\n",
      "desktop bundle/nested/hello λ.ts": "export const greeting = 'Hello λ';\n",
      "desktop bundle/nested/pixels.bin": binary },
    collision: { "fresh-before.txt": "Do not partially import\n", "index.ts": "Do not replace the existing file\n", "fresh-after.bin": binary },
  };
  assert.ok(fixtures[kind], `Unknown desktop fixture: ${kind}`);
  await saved(this.page);
  this.beforeDesktopDrop = await persistedRepositoryFiles(this.page);
  this.desktopDropDirectory = join(this.artifactDirectory, "desktop-selection");
  this.desktopDropFiles = Object.fromEntries(Object.entries(fixtures[kind]).map(([path, data]) => [path, Buffer.from(data)]));
  for (const [path, data] of Object.entries(this.desktopDropFiles)) {
    const destination = join(this.desktopDropDirectory, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  this.desktopDropSources = kind === "directory" ? [join(this.desktopDropDirectory, "desktop bundle")]
    : Object.keys(this.desktopDropFiles).map(path => join(this.desktopDropDirectory, path));
  this.desktopDropKind = kind;
  await this.page.evaluate(() => {
    globalThis.__desktopDropEvents = [];
    document.addEventListener("drop", event => {
      globalThis.__desktopDropEvents.push({ trusted: event.isTrusted, types: Array.from(event.dataTransfer.types),
        entries: Array.from(event.dataTransfer.items, item => {
          const entry = item.webkitGetAsEntry();
          return { name: entry?.name, directory: entry?.isDirectory };
        }) });
    }, true);
  });
});

async function dropDesktopSelection(world, target, root = false) {
  await target.scrollIntoViewIfNeeded();
  const bounds = await target.boundingBox();
  assert.ok(bounds);
  const position = { x: bounds.x + bounds.width / 2,
    y: root ? bounds.y + bounds.height - 15 : bounds.y + bounds.height / 2 };
  const path = root ? "" : await target.getAttribute("data-file-path");
  const directory = root || await target.getAttribute("data-file-kind") === "directory" ? path
    : path.slice(0, path.lastIndexOf("/") + 1).replace(/\/$/, "");
  const session = await world.context.newCDPSession(world.page);
  try {
    const data = { items: [], files: world.desktopDropSources, dragOperationsMask: 1 };
    // CDP gives Chromium real filesystem paths. Chromium constructs trusted
    // DataTransfer file/directory entries and grants their read access.
    await session.send("Input.dispatchDragEvent", { type: "dragEnter", ...position, data });
    await session.send("Input.dispatchDragEvent", { type: "dragOver", ...position, data });
    if (!directory) await expect(world.page.locator("[data-file-drop-root]")).toHaveCount(1);
    else await expect(treeItem(world.page, directory).locator(":scope > .tree-row")).toHaveClass(/\bdrop-target\b/);
    await session.send("Input.dispatchDragEvent", { type: "drop", ...position, data });
  } finally { await session.detach(); }
  const events = await world.page.evaluate(() => globalThis.__desktopDropEvents);
  assert.equal(events.length, 1);
  assert.equal(events[0].trusted, true);
  assert.ok(events[0].types.includes("Files"));
  assert.deepEqual(events[0].entries, world.desktopDropSources.map(path => ({ name: path.split("/").pop(), directory: world.desktopDropKind === "directory" })));
  await saved(world.page);
  await expect(world.page.locator(".drag-source, .drop-target, [data-file-drop-root]")).toHaveCount(0);
}

When("I drop the desktop selection onto repository entry {string}", async function (path) {
  await dropDesktopSelection(this, treeItem(this.page, path).locator(":scope > .tree-row"));
});

When("I drop the desktop selection onto blank navigator space", async function () {
  await dropDesktopSelection(this, this.page.locator(".files-section"), true);
});

async function assertDesktopSourcesUnchanged(world) {
  for (const [path, bytes] of Object.entries(world.desktopDropFiles)) {
    assert.deepEqual(await readFile(join(world.desktopDropDirectory, path)), bytes, `Desktop source ${path} must remain unchanged`);
  }
}

Then("the desktop selection is copied under {string} with exact persisted bytes", async function (directory) {
  await saved(this.page);
  await expect(this.page.getByRole("alert")).toHaveCount(0);
  const expected = { ...this.beforeDesktopDrop, ...Object.fromEntries(Object.entries(this.desktopDropFiles)
    .map(([path, bytes]) => [directory ? `${directory}/${path}` : path, Array.from(bytes)])) };
  await expect.poll(() => persistedRepositoryFiles(this.page)).toEqual(expected);
  await assertDesktopSourcesUnchanged(this);
});

Then("the desktop drop leaves all repository bytes unchanged", async function () {
  await saved(this.page);
  assert.deepEqual(await persistedRepositoryFiles(this.page), this.beforeDesktopDrop);
  await assertDesktopSourcesUnchanged(this);
});

Then("the desktop drop reports a collision for {string}", async function (path) {
  await expect(this.page.getByRole("alert")).toContainText(path);
  await expect(this.page.getByRole("alert")).toContainText(/already exists/i);
});
