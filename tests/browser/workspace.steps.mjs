// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { pageSelector, repositorySelector, selectPage, selectDropdown } from "./navigation.helpers.mjs";

const input = page => page.getByLabel("Code editor document", { exact: true });
const scroller = page => page.locator(".cm-editor > .cm-scroller");
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");
const scrollPosition = locator => locator.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }));

Given("the editor footer is enabled", async function () {
  await selectPage(this.page, "Settings");
  await selectDropdown(this.page, "Settings scope", "global");
  await this.page.getByRole("switch", { name: "Editor footer", exact: true }).check();
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

async function importWorkspace(world, name, extraFiles = {}) {
  const directory = join(world.artifactDirectory, name);
  const files = {
    "alpha.txt": Array.from({ length: 180 }, (_, index) =>
      `line_${String(index + 1).padStart(3, "0")} ${"a long document line with horizontal scrolling ".repeat(7)}`).join("\n"),
    "beta.txt": "A short second file.\n",
    "src/nested/gamma.txt": "A nested third file.\n",
    ...extraFiles,
  };
  await Promise.all(Object.entries(files).map(async ([path, content]) => {
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }));
  await world.page.getByLabel("Import directory", { exact: true }).setInputFiles(directory);
  await saved(world.page);
  await expect(repositorySelector(world.page)).toContainText(name);
}

Given("I import a workspace fixture named {string}", async function (name) {
  await importWorkspace(this, name);
});

Given("I import a workspace fixture with a long sidebar", async function () {
  const files = Object.fromEntries(Array.from({ length: 42 }, (_, index) =>
    [`folder${String(index).padStart(2, "0")}/entry.txt`, `Sidebar item ${index}\n`]));
  await importWorkspace(this, "Workspace sidebar", files);
});

When("I reload the saved workspace", async function () {
  await saved(this.page);
  await this.page.reload({ waitUntil: "networkidle" });
  await saved(this.page);
  await expect(this.page.getByRole("alert")).toHaveCount(0);
});

Then("the workspace repository is {string}", async function (name) {
  await expect(repositorySelector(this.page)).toContainText(name);
});

Then("the workspace tabs are {string} with {string} active", async function (paths, active) {
  const tabs = this.page.locator('.file-tabs button[aria-label^="Switch to "]');
  await expect.poll(() => tabs.evaluateAll(buttons => buttons.map(button =>
    button.getAttribute("aria-label").slice("Switch to ".length)))).toEqual(paths.split(", "));
  await expect(this.page.getByRole("button", { name: `Switch to ${active}`, exact: true })).toHaveClass(/\bactive\b/);
  await expect(input(this.page)).toBeVisible();
});

When("I select and scroll a long workspace document", async function () {
  await input(this.page).focus();
  await this.page.keyboard.press("Control+Home");
  for (let line = 1; line < 61; line += 1) await this.page.keyboard.press("ArrowDown");
  await this.page.keyboard.press("Home");
  for (let column = 0; column < 6; column += 1) await this.page.keyboard.press("Shift+ArrowRight");
  await expect(this.page.locator(".editor-status")).toContainText("Ln 61, Col 7");
  await expect(this.page.locator(".cm-editor")).toHaveClass(/\bcm-has-selection\b/);
  await scroller(this.page).evaluate(element => { element.scrollTop = 950; element.scrollLeft = 160; });
  await expect.poll(() => scrollPosition(scroller(this.page))).toEqual({ top: 950, left: 160 });
  this.workspaceEditorPosition = await scrollPosition(scroller(this.page));
});

Then("the workspace document selection and scroll position are restored", async function () {
  await expect(this.page.locator(".editor-status")).toContainText("Ln 61, Col 7");
  await expect(this.page.locator(".cm-editor")).toHaveClass(/\bcm-has-selection\b/);
  await expect.poll(async () => {
    const current = await scrollPosition(scroller(this.page));
    return Math.abs(current.top - this.workspaceEditorPosition.top) <= 1 &&
      Math.abs(current.left - this.workspaceEditorPosition.left) <= 1;
  }).toBe(true);
});

When("I focus the workspace document without moving its selection", async function () {
  await input(this.page).evaluate(element => element.focus({ preventScroll: true }));
  await expect(input(this.page)).toBeFocused();
});

Then("the workspace document has keyboard focus", async function () {
  await expect(input(this.page)).toBeFocused();
});

When("I scroll the workspace sidebar", async function () {
  const sidebar = this.page.locator(".files-section");
  await sidebar.evaluate(element => { element.scrollTop = 300; });
  await expect.poll(() => sidebar.evaluate(element => element.scrollTop)).toBe(300);
  this.workspaceSidebarPosition = await scrollPosition(sidebar);
});

Then("the workspace sidebar scroll position is restored", async function () {
  await expect.poll(() => scrollPosition(this.page.locator(".files-section"))).toEqual(this.workspaceSidebarPosition);
});

When("I choose the workspace page {string}", async function (name) {
  await selectPage(this.page, name);
});

When("I choose and scroll the workspace Settings page", async function () {
  await selectPage(this.page, "Settings");
  const panel = this.page.getByRole("region", { name: "Settings", exact: true });
  await panel.evaluate(element => { element.scrollTop = 450; });
  await expect.poll(() => panel.evaluate(element => element.scrollTop)).toBe(450);
  this.workspaceSettingsPosition = await scrollPosition(panel);
});

Then("the workspace page is {string}", async function (name) {
  await expect(pageSelector(this.page)).toHaveAttribute("data-value", name.toLowerCase());
  await expect(this.page.getByRole("region", { name, exact: true })).toBeVisible();
});

Then("the workspace Settings scroll position is restored", async function () {
  assert.ok(this.workspaceSettingsPosition.top > 0);
  await expect.poll(() => scrollPosition(this.page.getByRole("region", { name: "Settings", exact: true })))
    .toEqual(this.workspaceSettingsPosition);
});

When("the saved workspace metadata is malformed", async function () {
  // Corruption is the only case that writes storage directly; normal scenarios
  // establish and verify workspace state entirely through the interface.
  await this.page.addInitScript(() => localStorage.setItem("code.workspace.v1", "{invalid JSON"));
});
