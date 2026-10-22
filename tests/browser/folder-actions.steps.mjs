// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const treeItem = (page, path) => page.getByRole("tree", { name: "Repository files", exact: true })
  .getByRole("treeitem", { name: path, exact: true });
const menu = (page, path) => page.getByRole("menu", { name: `Folder actions for ${path}`, exact: true });
const nameInput = world => world.page.getByRole("textbox", { name: `Change name of ${world.folderActionPath}`, exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");

Given("an additional repository file {string} containing {string}", async function (path, contents) {
  await saved(this.page);
  const navigator = this.page.locator(".files-section");
  const bounds = await navigator.boundingBox();
  assert.ok(bounds);
  await navigator.click({ button: "right", position: { x: bounds.width / 2, y: bounds.height - 15 } });
  await this.page.getByRole("menu", { name: "Repository actions", exact: true })
    .getByRole("menuitem", { name: "New file", exact: true }).click();
  const dialog = this.page.getByRole("dialog", { name: "New file", exact: true });
  await dialog.getByLabel("File path", { exact: true }).fill(path);
  await dialog.getByRole("button", { name: "Create file", exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(this.page);
  await this.page.getByLabel("Code editor document", { exact: true }).click();
  await this.page.keyboard.insertText(contents.replaceAll("\\n", "\n"));
  await saved(this.page);
});

When("I right-click the tree folder name {string}", async function (path) {
  await saved(this.page);
  await treeItem(this.page, path).getByText(path.split("/").pop(), { exact: true }).click({ button: "right" });
  const actions = menu(this.page, path);
  await expect(actions).toBeVisible();
  await expect(actions.getByRole("menuitem", { name: "Change name", exact: true })).toBeVisible();
  await expect(actions.getByRole("menuitem", { name: "Delete folder", exact: true })).toBeVisible();
  this.folderActionPath = path;
});

When("I choose Change name for the folder {string}", async function (path) {
  assert.equal(this.folderActionPath, path);
  await menu(this.page, path).getByRole("menuitem", { name: "Change name", exact: true }).click();
  await expect(nameInput(this)).toBeFocused();
  await expect(nameInput(this)).toHaveValue(path.split("/").pop());
  await expect(treeItem(this.page, path).getByRole("textbox", { name: `Change name of ${path}`, exact: true }))
    .toBeVisible();
});

When("I enter the folder name {string} and press {string}", async function (name, key) {
  assert.ok(["Enter", "Escape"].includes(key));
  await nameInput(this).fill(name);
  await nameInput(this).press(key);
});

Then("the folder name editor is closed", async function () {
  await saved(this.page);
  await expect(this.page.getByRole("textbox", { name: /^Change name of / })).toHaveCount(0);
});

Then("the folder name conflict keeps {string} ready to correct", async function (name) {
  await expect(this.page.getByRole("alert")).toContainText(/already exists/i);
  await expect(nameInput(this)).toHaveValue(name);
  await expect(nameInput(this)).toHaveAttribute("aria-invalid", "true");
  await expect(nameInput(this)).toBeFocused();
});

When("I choose Delete folder for {string}", async function (path) {
  await menu(this.page, path).getByRole("menuitem", { name: "Delete folder", exact: true }).click();
});

Then("the folder deletion confirmation names {string} and includes its contents", async function (path) {
  const dialog = this.page.getByRole("dialog", { name: "Delete folder", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(path, { exact: true })).toBeVisible();
  await expect(dialog).toContainText(/all (?:its )?(?:files|contents)/i);
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
});

When("I confirm the folder deletion", async function () {
  const dialog = this.page.getByRole("dialog", { name: "Delete folder", exact: true });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(this.page);
});
