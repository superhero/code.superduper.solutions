// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const fileDialog = page => page.getByRole("dialog", { name: "New file", exact: true });
const pathInput = page => fileDialog(page).getByRole("textbox", { name: "File path", exact: true });
const rootMenu = page => page.getByRole("menu", { name: "Repository actions", exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");

When("I choose New file from the folder menu {string}", async function (path) {
  const menu = this.page.getByRole("menu", { name: `Folder actions for ${path}`, exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "New file", exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(fileDialog(this.page)).toBeVisible();
});

Then("the New file form contains {string} with its caret at the end", async function (path) {
  const input = pathInput(this.page);
  await expect(input).toHaveValue(path);
  await expect(input).toBeFocused();
  assert.deepEqual(await input.evaluate(element => [element.selectionStart, element.selectionEnd]), [path.length, path.length]);
});

When("I append the new filename {string} and submit it", async function (filename) {
  await pathInput(this.page).pressSequentially(filename);
  await fileDialog(this.page).getByRole("button", { name: "Create file", exact: true }).click();
});

Then("the new file {string} is open in the editor", async function (path) {
  await expect(fileDialog(this.page)).toBeHidden();
  await saved(this.page);
  await expect(this.page.getByRole("button", { name: "Page", exact: true })).toHaveAttribute("data-value", "editor");
  await expect(this.page.getByRole("region", { name: "Editor", exact: true })).toBeVisible();
  await expect(this.page.getByRole("button", { name: `Switch to ${path}`, exact: true })).toHaveClass(/\bactive\b/);
  await expect(this.page.getByRole("treeitem", { name: path, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(this.page.getByLabel("Code editor document", { exact: true })).toHaveText("");
});

When("I right-click blank navigator background", async function () {
  const area = this.page.locator(".files-section");
  const bounds = await area.boundingBox();
  assert.ok(bounds);
  const position = { x: bounds.width / 2, y: bounds.height - 15 };
  const blank = await this.page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest(".files-section") && !element.closest("[role=treeitem], button, input, a");
  }, { x: bounds.x + position.x, y: bounds.y + position.y });
  assert.ok(blank, "Right-click actual empty navigator space rather than a file or control");
  await area.click({ button: "right", position });
});

Then("the repository background menu replaces the browser menu", async function () {
  await expect(rootMenu(this.page)).toBeVisible();
  await expect(this.page.getByRole("menu")).toHaveCount(1);
  await expect(rootMenu(this.page).getByRole("menuitem", { name: "New file", exact: true })).toBeEnabled();
  const events = await this.page.evaluate(() => globalThis.__contextTargetEvents.map(event => ({ prevented: event.defaultPrevented })));
  assert.equal(events.length, 1);
  assert.equal(events[0].prevented, true);
});

When("I choose New file from the repository background menu", async function () {
  await rootMenu(this.page).getByRole("menuitem", { name: "New file", exact: true }).click();
  await expect(rootMenu(this.page)).toBeHidden();
  await expect(fileDialog(this.page)).toBeVisible();
});

When("I cancel the new file form", async function () {
  await fileDialog(this.page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(fileDialog(this.page)).toBeHidden();
  await saved(this.page);
});

Then("the creation conflict keeps the path {string} available to correct", async function (path) {
  await expect(fileDialog(this.page)).toBeVisible();
  await expect(fileDialog(this.page).getByRole("alert")).toContainText(/already exists/i);
  await expect(pathInput(this.page)).toHaveValue(path);
  await expect(pathInput(this.page)).toBeEditable();
  await expect(fileDialog(this.page).getByRole("button", { name: "Create file", exact: true })).toBeEnabled();
});
