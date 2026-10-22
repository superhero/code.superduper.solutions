// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const treeItem = (page, path) => page.getByRole("tree", { name: "Repository files", exact: true })
  .getByRole("treeitem", { name: path, exact: true });
const fileTab = (page, path) => page.getByRole("button", { name: `Switch to ${path}`, exact: true });
const menu = (page, path) => page.getByRole("menu", { name: `File actions for ${path}`, exact: true });
const filenameInput = world => world.page.getByRole("textbox", { name: `Change name of ${world.fileActionPath}`, exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");

When("I right-click the tree filename {string}", async function (path) {
  await saved(this.page);
  await treeItem(this.page, path).getByText(path.split("/").pop(), { exact: true }).click({ button: "right" });
  await expect(menu(this.page, path)).toBeVisible();
  this.fileActionOrigin = "tree";
  this.fileActionPath = path;
});

When("I right-click the open file tab {string}", async function (path) {
  await saved(this.page);
  await fileTab(this.page, path).click({ button: "right" });
  await expect(menu(this.page, path)).toBeVisible();
  this.fileActionOrigin = "tab";
  this.fileActionPath = path;
});

When("I choose Change name for {string}", async function (path) {
  assert.equal(this.fileActionPath, path);
  await menu(this.page, path).getByRole("menuitem", { name: "Change name", exact: true }).click();
  const input = filenameInput(this);
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(path.split("/").pop());
  const container = this.fileActionOrigin === "tree" ? treeItem(this.page, path) : this.page.locator(".file-tabs");
  await expect(container.getByRole("textbox", { name: `Change name of ${path}`, exact: true })).toBeVisible();
  await expect(this.page.getByRole("dialog", { name: "Rename file", exact: true })).toHaveCount(0);
});

When("I enter the filename {string} and press {string}", async function (name, key) {
  assert.ok(["Enter", "Escape"].includes(key));
  const input = filenameInput(this);
  await input.fill(name);
  await input.press(key);
});

Then("the filename editor is closed", async function () {
  await saved(this.page);
  await expect(this.page.getByRole("textbox", { name: /^Change name of / })).toHaveCount(0);
});

Then("the filename conflict keeps {string} ready to correct", async function (name) {
  await expect(this.page.getByRole("alert")).toContainText(/already exists/i);
  await expect(filenameInput(this)).toHaveValue(name);
  await expect(filenameInput(this)).toHaveAttribute("aria-invalid", "true");
  await expect(filenameInput(this)).toBeFocused();
});

Then("the open file tabs remain in this order:", async function (table) {
  await saved(this.page);
  await expect.poll(() => this.page.locator(".file-tabs button[aria-label^='Switch to ']")
    .evaluateAll(tabs => tabs.map(tab => tab.getAttribute("aria-label").slice("Switch to ".length))))
    .toEqual(table.hashes().map(({ path }) => path));
});

Then("the file toolbar has no rename or delete buttons", async function () {
  const toolbar = this.page.getByRole("group", { name: "File actions", exact: true });
  await expect(toolbar.getByRole("button", { name: "Rename file", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "Delete file", exact: true })).toHaveCount(0);
});

When("I choose Delete file for {string}", async function (path) {
  await menu(this.page, path).getByRole("menuitem", { name: "Delete file", exact: true }).click();
});

Then("the file deletion confirmation names {string}", async function (path) {
  const dialog = this.page.getByRole("dialog", { name: "Delete file", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(path, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
});

When("I confirm the filename deletion", async function () {
  const dialog = this.page.getByRole("dialog", { name: "Delete file", exact: true });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(this.page);
});

When("I open the tree filename menu for {string} using the keyboard", async function (path) {
  await treeItem(this.page, path).focus();
  await this.page.keyboard.press("Shift+F10");
  await expect(menu(this.page, path)).toBeVisible();
});

Then("the filename menu for {string} offers Change name and Delete file", async function (path) {
  const items = menu(this.page, path).getByRole("menuitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAccessibleName("Change name");
  await expect(items.nth(1)).toHaveAccessibleName("Delete file");
});

When("I dismiss the filename menu with Escape", async function () {
  await this.page.keyboard.press("Escape");
  await expect(this.page.getByRole("menu", { name: /^File actions for / })).toHaveCount(0);
});
