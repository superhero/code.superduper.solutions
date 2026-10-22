// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { repositoryAction, repositoryOptions, repositorySelector, selectPage, selectRepository, selectDropdown } from "./navigation.helpers.mjs";
import * as git from "isomorphic-git";
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
const editor = page => page.getByLabel("Code editor document", { exact: true });
const repositoryTree = page => page.getByRole("tree", { name: "Repository files", exact: true });
const treeItem = (page, path) => repositoryTree(page).getByRole("treeitem", { name: path, exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
const documentText = page => editor(page).locator(".cm-line").allTextContents().then(lines => lines.join("\n"));

async function histories(page) {
  await saved(page);
  return repositoryHistories(page);
}

async function expandFileAncestors(page, path) {
  const parts = path.split("/");
  for (let length = 1; length < parts.length; length += 1) {
    const directory = treeItem(page, parts.slice(0, length).join("/"));
    if (!await directory.count() || await directory.getAttribute("aria-expanded") === null) return false;
    if (await directory.getAttribute("aria-expanded") === "false") {
      await directory.locator(":scope > .tree-row").click();
      await expect(directory).toHaveAttribute("aria-expanded", "true");
    }
  }
  return true;
}

async function chooseFile(page, path) {
  await selectPage(page, "Editor");
  assert.equal(await expandFileAncestors(page, path), true, `The ancestor directories for ${path} must exist`);
  await treeItem(page, path).locator(":scope > .tree-row").click();
  await expect(editor(page)).toBeVisible();
}

async function settingsScope(page, scope) {
  await saved(page);
  await selectPage(page, "Settings");
  await selectDropdown(page, "Settings scope", scope);
}

async function writeImportDirectory(world, files) {
  const directory = join(world.artifactDirectory, "imported-project");
  world.importedFiles = files;
  for (const [path, content] of Object.entries(files)) {
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return directory;
}

async function importDirectory(world, files) {
  const directory = await writeImportDirectory(world, files);
  await world.page.getByLabel("Import directory", { exact: true }).setInputFiles(directory);
  await saved(world.page);
}

async function writeGitImportDirectory(world) {
  const directory = await writeImportDirectory(world, { "main.ts": "first version\n" });
  const context = { fs, dir: directory };
  const author = { name: "Imported Author", email: "imported@example.invalid", timestamp: 1_700_000_000, timezoneOffset: 0 };
  await git.init({ ...context, defaultBranch: "main" });
  await git.add({ ...context, filepath: "main.ts" });
  const first = await git.commit({ ...context, message: "First imported commit", author });
  await writeFile(join(directory, "main.ts"), "second version\n");
  await git.add({ ...context, filepath: "main.ts" });
  const second = await git.commit({ ...context, message: "Second imported commit", author: { ...author, timestamp: author.timestamp + 1 } });
  world.importedCommitIds = [second, first];
  world.importedWorkingText = "uncommitted imported changes\n";
  await writeFile(join(directory, "main.ts"), world.importedWorkingText);
  return directory;
}

async function recordCurrentRepository(world) {
  await saved(world.page);
  const repositories = repositorySelector(world.page);
  world.beforeRejectedImport = {
    id: await repositories.getAttribute("data-value"),
    options: await repositoryOptions(world.page),
    text: await documentText(world.page),
    histories: await histories(world.page),
  };
}

const contentValue = value => value.replaceAll("\\n", "\n");

Given("a browser repository named {string} with an empty file {string}", async function (name, path) {
  this.repositoryName = name;
  this.filePath = path;
  await repositoryAction(this.page, "New repository");
  const dialog = this.page.getByRole("dialog", { name: "New repository", exact: true });
  await dialog.getByLabel("Repository name", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create repository", exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(this.page);
  const navigator = this.page.locator(".files-section");
  const bounds = await navigator.boundingBox();
  assert.ok(bounds);
  await navigator.click({ button: "right", position: { x: bounds.width / 2, y: bounds.height - 15 } });
  await this.page.getByRole("menu", { name: "Repository actions", exact: true })
    .getByRole("menuitem", { name: "New file", exact: true }).click();
  const fileDialog = this.page.getByRole("dialog", { name: "New file", exact: true });
  await fileDialog.getByLabel("File path", { exact: true }).fill(path);
  await fileDialog.getByRole("button", { name: "Create file", exact: true }).click();
  await expect(fileDialog).toBeHidden();
  await saved(this.page);
  await chooseFile(this.page, path);
  await expect.poll(() => documentText(this.page)).toBe("");
});

Given("the current edit and source Git histories are recorded", async function () {
  this.recordedHistories = await histories(this.page);
});

When("I type {string} into the code document", async function (value) {
  await editor(this.page).click();
  await editor(this.page).press("Control+End");
  await editor(this.page).pressSequentially(value);
  await saved(this.page);
});

Then("the code document contains {string} after persistence", async function (value) {
  await saved(this.page);
  await expect.poll(() => documentText(this.page)).toBe(contentValue(value));
});

Then("exactly {int} distinct Git edit commits precede the recorded history", async function (count) {
  const current = await histories(this.page);
  assert.equal(current.edits.length, this.recordedHistories.edits.length + count);
  assert.equal(new Set(current.edits).size, current.edits.length);
  assert.deepEqual(current.edits.slice(count), this.recordedHistories.edits);
});

Then("the source Git history is unchanged", async function () {
  assert.deepEqual((await histories(this.page)).commits, this.recordedHistories.commits);
});

Then("the edit Git history is unchanged", async function () {
  assert.deepEqual((await histories(this.page)).edits, this.recordedHistories.edits);
});

When("the editor is reloaded after persistence", async function () {
  await saved(this.page);
  await this.page.reload({ waitUntil: "networkidle" });
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

Then("no repository file is open", async function () {
  await saved(this.page);
  await expect(editor(this.page)).toHaveCount(0);
  await expect(this.page.locator('[aria-label="Open files"]')).toHaveCount(0);
  await expect(repositoryTree(this.page).locator('[aria-selected="true"], [aria-current="true"]')).toHaveCount(0);
});

When("I open the repository file {string}", async function (path) {
  await saved(this.page);
  await chooseFile(this.page, path);
  this.filePath = path;
});

When("I select the repository {string}", async function (name) {
  await saved(this.page);
  await selectRepository(this.page, name);
  this.repositoryName = name;
});

When("I undo the latest editor transaction", async function () {
  await saved(this.page);
  if (!await button(this.page, "Undo").count()) await selectPage(this.page, "History");
  await button(this.page, "Undo").click();
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

When("I redo the latest editor transaction", async function () {
  await saved(this.page);
  await button(this.page, "Redo").click();
  await saved(this.page);
});

Then("the redo action is unavailable", async function () {
  await saved(this.page);
  await expect(button(this.page, "Redo")).toBeDisabled();
});

When("I rapidly type {string} and immediately undo", async function (value) {
  await editor(this.page).click();
  await editor(this.page).pressSequentially(value);
  await editor(this.page).press("Control+z");
});

When("I rapidly type {string} and Vite requests a page reload", async function (value) {
  await editor(this.page).click();
  await editor(this.page).pressSequentially(value);
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("Saving changes…");
  await this.page.evaluate(() => { globalThis.__editorBeforeViteReload = true; });
  await Promise.all([
    this.page.waitForNavigation({ waitUntil: "networkidle", timeout: 30_000 }),
    this.reloadDevelopmentPage(),
  ]);
  assert.equal(await this.page.evaluate(() => globalThis.__editorBeforeViteReload), undefined,
    "Vite must actually replace the page after the writes drain");
  await saved(this.page);
});

When("I rapidly type {string} and Vite updates the stylesheet", async function (value) {
  await editor(this.page).click();
  await editor(this.page).pressSequentially(value);
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("Saving changes…");
  const token = await this.page.evaluate(() => {
    globalThis.__editorBeforeViteUpdate = crypto.randomUUID();
    return globalThis.__editorBeforeViteUpdate;
  });
  await this.updateDevelopmentStyles(token);
  await expect.poll(() => this.page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--browser-hmr-generation").trim()))
    .toBe(JSON.stringify(token));
  assert.equal(await this.page.evaluate(() => globalThis.__editorBeforeViteUpdate), token,
    "A CSS hot update must keep the existing document");
  await saved(this.page);
});

export async function createSourceCommitFixture(world, message) {
  await saved(world.page);
  const repositoryId = await repositorySelector(world.page).getAttribute("data-value");
  assert.ok(repositoryId);
  let repositoryWorker;
  for (const worker of world.page.workers()) {
    if (await worker.evaluate(() => self.name) === "code-repositories") { repositoryWorker = worker; break; }
  }
  assert.ok(repositoryWorker, "The fixture must use the application's existing repository worker");
  const head = await repositoryWorker.evaluate(async ({ repositoryId, message }) => {
    // Test setup uses the real worker protocol, without adding application UI or
    // bypassing repository locking. String IDs cannot collide with client IDs.
    const request = (method, args) => new Promise((resolve, reject) => {
      const id = `source-commit-fixture:${crypto.randomUUID()}`;
      const original = globalThis.postMessage;
      const restore = () => { globalThis.postMessage = original; clearTimeout(timeout); };
      const timeout = setTimeout(() => { restore(); reject(new Error(`Fixture worker ${method} timed out`)); }, 10_000);
      globalThis.postMessage = function (reply, ...options) {
        if (reply?.id !== id) return original.call(this, reply, ...options);
        restore();
        if (reply.error) reject(new Error(reply.error.message));
        else resolve(reply.value);
      };
      try { globalThis.dispatchEvent(new MessageEvent("message", { data: { id, method, args } })); }
      catch (error) { restore(); reject(error); }
    });
    const repository = await request("open", [repositoryId]);
    const committed = await request("commit", [repositoryId, message,
      { name: "Browser Fixture", email: "fixture@example.invalid" }, repository.revision]);
    return committed.head;
  }, { repositoryId, message });
  assert.match(head, /^[a-f0-9]{40}$/);
  await world.page.reload({ waitUntil: "networkidle" });
  await saved(world.page);
  assert.equal((await repositorySnapshot(world.page)).head, head);
}

Given("a source commit fixture named {string} records the current repository", async function (message) {
  await createSourceCommitFixture(this, message);
});

When("I rename the selected file to {string}", async function (path) {
  await saved(this.page);
  const selected = this.page.locator(".file-tabs button.active");
  const current = (await selected.getAttribute("aria-label")).slice("Switch to ".length);
  await this.page.getByRole("tree",{name:"Repository files",exact:true}).getByRole("treeitem",{name:current,exact:true}).locator(":scope > .tree-row").click({button:"right"});
  await this.page.getByRole("menu", { name: `File actions for ${current}`, exact: true })
    .getByRole("menuitem", { name: "Change name", exact: true }).click();
  const input = this.page.getByRole("textbox", { name: `Change name of ${current}`, exact: true });
  await input.fill(path.split("/").pop());
  await input.press("Enter");
  await expect(input).toHaveCount(0);
  await saved(this.page);
  this.filePath = path;
});

Then("the selected file {string} contains {string}", async function (path, contents) {
  await saved(this.page);
  await chooseFile(this.page, path);
  await expect.poll(() => documentText(this.page)).toBe(contentValue(contents));
});

When("I delete the selected file", async function () {
  await saved(this.page);
  const selected = this.page.locator(".file-tabs button.active");
  const current = (await selected.getAttribute("aria-label")).slice("Switch to ".length);
  await this.page.getByRole("tree",{name:"Repository files",exact:true}).getByRole("treeitem",{name:current,exact:true}).locator(":scope > .tree-row").click({button:"right"});
  await this.page.getByRole("menu", { name: `File actions for ${current}`, exact: true })
    .getByRole("menuitem", { name: "Delete file", exact: true }).click();
  const dialog = this.page.getByRole("dialog", { name: "Delete file", exact: true });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(this.page);
});

Then("the repository file {string} is absent", async function (path) {
  await expandFileAncestors(this.page, path);
  await expect(treeItem(this.page, path)).toHaveCount(0);
});

Given("another tab has opened the same repository and file", async function () {
  await saved(this.page);
  this.otherPage = await this.context.newPage();
  this.observePage(this.otherPage);
  await this.otherPage.goto(this.baseURL, { waitUntil: "networkidle" });
  await saved(this.otherPage);
  await selectRepository(this.otherPage, this.repositoryName);
  await chooseFile(this.otherPage, this.filePath);
});

When("the stale tab tries to type {string}", async function (text) {
  await saved(this.page);
  await editor(this.otherPage).click();
  await this.otherPage.keyboard.insertText(text);
});

Then("the stale tab shows a recoverable conflict", async function () {
  const conflict = this.otherPage.getByRole("alert").filter({ hasText: "Your changes need attention" });
  await expect(conflict).toContainText(/changed|stale|another tab/i);
  await expect(conflict.getByRole("button", { name: "Reload repository", exact: true })).toBeEnabled();
});

Then("reopening the stale tab reads {string} without overwriting it", async function (text) {
  await button(this.otherPage, "Reload repository").click();
  const dialog = this.otherPage.getByRole("dialog", { name: "Reload repository", exact: true });
  await dialog.getByRole("button", { name: "Reload and discard", exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(this.otherPage);
  await chooseFile(this.otherPage, this.filePath);
  await expect.poll(() => documentText(this.otherPage)).toBe(text);
  await this.page.reload({ waitUntil: "networkidle" });
  await saved(this.page);
  await chooseFile(this.page, this.filePath);
  await expect.poll(() => documentText(this.page)).toBe(text);
});

When("I import a directory containing nested text files", async function () {
  await importDirectory(this, { "README.md": "# Imported\n", "nested/hello.txt": "Héllo, browser!\n" });
});

When("I import a directory with a nested file tree", async function () {
  await importDirectory(this, {
    "dir10/index.ts": "Second directory\n",
    "file10.txt": "Tenth root file\n",
    "src/lib/index.ts": "Nested source file\n",
    "file2.txt": "Second root file\n",
    "dir2/index.ts": "First directory\n",
  });
});

Given("interface motion is enabled", async function () {
  await this.page.emulateMedia({ reducedMotion: "no-preference" });
});

Then("the visible repository tree paths are", async function (table) {
  await expect.poll(() => repositoryTree(this.page).getByRole("treeitem")
    .evaluateAll(items => items.map(item => item.getAttribute("aria-label"))))
    .toEqual(table.hashes().map(row => row.path));
});

Then("the repository tree item {string} displays the name {string}", async function (path, name) {
  await expect(treeItem(this.page, path).getByText(name, { exact: true })).toBeVisible();
});

Then("the repository directory {string} is {word}", async function (path, state) {
  assert.ok(["expanded", "collapsed"].includes(state));
  await expect(treeItem(this.page, path)).toHaveAttribute("aria-expanded", String(state === "expanded"));
});

When("I toggle the repository directory {string}", async function (path) {
  const directory = treeItem(this.page, path);
  assert.notEqual(await directory.getAttribute("aria-expanded"), null);
  await directory.locator(":scope > .tree-row").click();
});

When("I focus the repository tree item {string}", async function (path) {
  await treeItem(this.page, path).focus();
});

When("I press {string} in the repository tree", async function (key) {
  assert.equal(await repositoryTree(this.page).evaluate(tree => tree.contains(document.activeElement)), true);
  await this.page.keyboard.press(key);
});

Then("the repository tree item {string} has focus", async function (path) {
  await expect(treeItem(this.page, path)).toBeFocused();
});

Then("the repository tree file {string} is selected", async function (path) {
  await expect(treeItem(this.page, path)).toHaveAttribute("aria-selected", "true");
  await expect(treeItem(this.page, path)).toHaveAttribute("aria-current", "true");
  await expect(repositoryTree(this.page).locator('[aria-selected="true"]')).toHaveCount(1);
});

Then("the expanded repository tree is captured", async function () {
  const screenshot = await this.page.screenshot({ path: join(this.artifactDirectory, "file-tree.png") });
  await this.attach(screenshot, "image/png");
});

When("I import a complete Git directory with two commits and uncommitted changes", async function () {
  const directory = await writeGitImportDirectory(this);
  await this.page.getByLabel("Import directory", { exact: true }).setInputFiles(directory);
  await saved(this.page);
});

When("I import a linked submodule directory with two commits and uncommitted changes", async function () {
  const directory = await writeGitImportDirectory(this);
  await git.setConfig({ fs, dir: directory, path: "core.worktree", value: "../imported-project" });
  this.linkedGitDirectory = join(this.artifactDirectory, "git-metadata");
  await rename(join(directory, ".git"), this.linkedGitDirectory);
  await writeFile(join(directory, ".git"), "gitdir: ../git-metadata\n");
  await this.page.getByLabel("Import directory", { exact: true }).setInputFiles(directory);
});

Then("the import requests the Git directory {string}", async function (path) {
  const dialog = this.page.getByRole("dialog", { name: "Import Git history", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(path);
  await expect(dialog.getByRole("button", { name: "Choose Git directory", exact: true })).toBeEnabled();
});

When("I select the linked submodule Git directory", async function () {
  await this.page.getByLabel("Import Git directory", { exact: true }).setInputFiles(this.linkedGitDirectory);
});

Then("the Git history import dialog is closed", async function () {
  await expect(this.page.getByRole("dialog", { name: "Import Git history", exact: true })).toBeHidden();
  await saved(this.page);
});

Given("the current repository state is recorded", async function () {
  await recordCurrentRepository(this);
});

When("I cancel the Git history import", async function () {
  await this.page.getByRole("dialog", { name: "Import Git history", exact: true })
    .getByRole("button", { name: "Cancel", exact: true }).click();
});

When("I select a Git directory without HEAD", async function () {
  const directory = join(this.artifactDirectory, "incomplete-git-metadata");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "config"), "[core]\n\tbare = false\n");
  await this.page.getByLabel("Import Git directory", { exact: true }).setInputFiles(directory);
});

Then("the Git history import dialog explains that HEAD is missing", async function () {
  const dialog = this.page.getByRole("dialog", { name: "Import Git history", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(/HEAD/);
  await expect(dialog.getByRole("button", { name: "Choose Git directory", exact: true })).toBeEnabled();
});

Then("the imported repository retains its source commits and uncommitted changes", async function () {
  await saved(this.page);
  await expect(repositorySelector(this.page)).toContainText("imported-project");
  assert.deepEqual((await histories(this.page)).commits, this.importedCommitIds);
  await expect(repositoryTree(this.page).getByRole("treeitem")).toHaveCount(1);
  await chooseFile(this.page, "main.ts");
  await expect.poll(() => documentText(this.page)).toBe(this.importedWorkingText);
  await expect(this.page.getByRole("alert")).toHaveCount(0);
});

When("I try to import a directory containing {string} at {string}", async function (kind, path) {
  await recordCurrentRepository(this);
  const directory = await writeImportDirectory(this, { "README.md": "A repository that must not be published\n", [path]: "ref: refs/heads/main\n" });
  await this.page.getByLabel("Import directory", { exact: true }).setInputFiles(directory);
});

Then("the rejected import identifies {string} and explains {string}", async function (path, kind) {
  const alert = this.page.getByRole("alert");
  await expect(alert).toContainText(path);
  const explanation = {
    "nested Git": /nested Git/i,
    "mixed-case Git": /Git metadata must use the exact name \.git/,
  }[kind];
  assert.ok(explanation, `Unknown import problem: ${kind}`);
  await expect(alert).toContainText(explanation);
});

Then("the existing repository remains selected and unchanged", async function () {
  await saved(this.page);
  const before = this.beforeRejectedImport;
  const repositories = repositorySelector(this.page);
  await expect(repositories).toHaveAttribute("data-value", before.id);
  assert.deepEqual(await repositoryOptions(this.page), before.options);
  assert.deepEqual(await histories(this.page), before.histories);
  await chooseFile(this.page, this.filePath);
  await expect.poll(() => documentText(this.page)).toBe(before.text);
});

When("I import a directory with EditorConfig indentation rules", async function () {
  await importDirectory(this, { ".editorconfig": "root = true\n[*]\nindent_style = space\nindent_size = 4\ntab_width = 6\n",
    "nested/source.js": "const value = 1;\n" });
});

When("the editor Tab key is configured to indent code", async function () {
  await settingsScope(this.page, "global");
  await this.page.getByRole("switch", { name: "Tab key", exact: true }).check();
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

When("I indent the first line of the code document", async function () {
  await editor(this.page).click();
  await editor(this.page).press("Control+Home");
  await editor(this.page).press("Tab");
  await saved(this.page);
});

Then("the code editor uses a tab width of {int}", async function (size) {
  await expect(editor(this.page)).toHaveCSS("tab-size", String(size));
});

Then("settings scope is selected in the top header after Settings", async function () {
  const navigation = this.page.getByRole("navigation", { name: "Repository navigation", exact: true });
  const page = navigation.getByRole("button", { name: "Page", exact: true });
  const scope = navigation.getByRole("button", { name: "Settings scope", exact: true });
  await expect(page).toContainText("Settings");
  await expect(scope).toBeVisible();
  await expect(scope).toContainText("Global defaults");
  assert.equal(await navigation.evaluate(element => {
    const page = element.querySelector('[aria-label="Page"]');
    const scope = element.querySelector('[aria-label="Settings scope"]');
    return Boolean(page && scope && (page.compareDocumentPosition(scope) & Node.DOCUMENT_POSITION_FOLLOWING));
  }), true);
  await expect(this.page.getByRole("combobox", { name: "Settings scope", exact: true })).toHaveCount(0);
  await scope.click();
  const menu = this.page.getByRole("menu", { name: "Settings scope", exact: true });
  await expect(menu.getByRole("menuitemradio")).toHaveCount(3);
  await expect(menu.getByRole("menuitemradio", { name: "Global defaults", exact: true })).toHaveAttribute("aria-checked", "true");
  await this.page.keyboard.press("Escape");
});

When("the {string} settings scope sets tab width to {int}", async function (scope, size) {
  await settingsScope(this.page, scope);
  await this.page.getByLabel("Tab width", { exact: true }).fill(String(size));
  await this.page.getByLabel("Tab width", { exact: true }).press("Tab");
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

When("the {string} settings scope inherits its tab width again", async function (scope) {
  await settingsScope(this.page, scope);
  await button(this.page, "Inherit Tab width").click();
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

Then("the imported repository exposes the original nested file contents", async function () {
  for (const [path, content] of Object.entries(this.importedFiles)) {
    await chooseFile(this.page, path);
    await expect.poll(() => documentText(this.page)).toBe(content);
  }
});

When("the global editor font size is set to {int}", async function (size) {
  await settingsScope(this.page, "global");
  await this.page.getByLabel("Font size", { exact: true }).fill(String(size));
  await this.page.getByLabel("Font size", { exact: true }).press("Tab");
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

When("this repository overrides the editor font size with {int}", async function (size) {
  await settingsScope(this.page, "repository");
  await this.page.getByLabel("Font size", { exact: true }).fill(String(size));
  await this.page.getByLabel("Font size", { exact: true }).press("Tab");
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

When("this repository inherits its editor font size again", async function () {
  await settingsScope(this.page, "repository");
  await button(this.page, "Inherit Font size").click();
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

Then("the code editor uses font size {int}", async function (size) {
  await expect(this.page.locator(".cm-editor")).toHaveCSS("font-size", `${size}px`);
});

When("the global read-only editor setting is enabled", async function () {
  await settingsScope(this.page, "global");
  await this.page.getByRole("switch", { name: "Read-only editor", exact: true }).check();
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

Then("the code document is selectable but rejects document edits", async function () {
  const before = await documentText(this.page);
  await expect(editor(this.page)).toHaveAttribute("aria-readonly", "true");
  await expect(editor(this.page)).toHaveAttribute("contenteditable", "true");
  await editor(this.page).click();
  await editor(this.page).press("Control+a");
  assert.equal(await this.page.evaluate(() => getSelection()?.toString()), before);
  await this.page.keyboard.insertText("This must not be written");
  await expect.poll(() => documentText(this.page)).toBe(before);
  await saved(this.page);
});

Then("file and directory rows match the branch selector height",async function(){
  const geometry=await this.page.getByRole('complementary',{name:'Repository explorer'}).evaluate(root=>{
    const branch=root.querySelector('[aria-label="Branch"]').getBoundingClientRect();
    const rows=[...root.querySelectorAll('.tree-row')].filter(row=>row.getBoundingClientRect().height>0).map(row=>{
      const rect=row.getBoundingClientRect();return{height:rect.height,top:rect.top,bottom:rect.bottom};
    });return{branch:{height:branch.height,bottom:branch.bottom},rows};
  });
  assert.ok(geometry.rows.length>2);
  for(const row of geometry.rows)assert.ok(Math.abs(row.height-geometry.branch.height)<.6,JSON.stringify(geometry));
  assert.ok(Math.abs(geometry.rows[0].top-geometry.branch.bottom-2)<.6,JSON.stringify(geometry));
  for(let index=1;index<geometry.rows.length;index++)assert.ok(Math.abs(geometry.rows[index].top-geometry.rows[index-1].bottom-2)<.6,JSON.stringify(geometry));
});
