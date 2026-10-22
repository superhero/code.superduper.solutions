// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { repositoryAction } from "./navigation.helpers.mjs";

const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");
const historyButton = (page, operation) => {
  assert.ok(["Undo", "Redo"].includes(operation));
  return page.getByRole("button", { name: operation, exact: true });
};
const wrapping = page => page.getByRole("switch", { name: "Line wrapping", exact: true });
const editor = page => page.getByLabel("Code editor document", { exact: true });

// History assertions never navigate to another page to inspect the journal:
// that navigation is itself a deliberate action in the application timeline.
When("I invoke application {string}", async function (operation) {
  await saved(this.page);
  await historyButton(this.page, operation).click();
  await saved(this.page);
  await expect(this.page.getByRole("alert")).toHaveCount(0);
});

Then("application {string} is available", async function (operation) {
  await saved(this.page);
  await expect(historyButton(this.page, operation)).toBeVisible();
  await expect(historyButton(this.page, operation)).toBeEnabled();
});

When("I invoke application {string} from the empty editor keyboard", async function (operation) {
  assert.ok(["Undo", "Redo"].includes(operation));
  await this.page.getByRole("region", { name: "Editor", exact: true }).focus();
  await this.page.keyboard.press(operation === "Undo" ? "Control+z" : "Control+Shift+Z");
  await saved(this.page);
});

When("I undo and redo text in a repository-name form", async function () {
  await repositoryAction(this.page, "New repository");
  const dialog = this.page.getByRole("dialog", { name: "New repository", exact: true });
  const name = dialog.getByLabel("Repository name", { exact: true });
  await name.focus();
  await this.page.keyboard.insertText("Temporary repository name");
  await expect(name).toHaveValue("Temporary repository name");
  await this.page.keyboard.press("Control+z");
  await expect(name).toHaveValue("");
  await this.page.keyboard.press("Control+Shift+Z");
  await expect(name).toHaveValue("Temporary repository name");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toBeHidden();
});

When("I enable line wrapping without leaving Settings", async function () {
  await expect(wrapping(this.page)).not.toBeChecked();
  await wrapping(this.page).check();
  await saved(this.page);
});

Then("line wrapping is {word} in Settings", async function (state) {
  assert.ok(["enabled", "disabled"].includes(state));
  await expect(wrapping(this.page)).toBeChecked({ checked: state === "enabled" });
});

When("I select the workspace text {string} from column {int}", async function (text, column) {
  await editor(this.page).focus();
  await this.page.keyboard.press("Control+Home");
  for (let index = 1; index < column; index += 1) await this.page.keyboard.press("ArrowRight");
  for (let index = 0; index < text.length; index += 1) await this.page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => this.page.evaluate(() => getSelection()?.toString())).toBe(text);
});

When("I replace the selected workspace text with {string}", async function (text) {
  await expect(editor(this.page)).toBeFocused();
  await this.page.keyboard.insertText(text);
  await saved(this.page);
});

Then("the workspace selection contains {string} ending at column {int}", async function (text, column) {
  await expect(this.page.locator(".editor-status")).toContainText(`Ln 1, Col ${column}`);
  await expect(this.page.locator(".cm-editor")).toHaveClass(/\bcm-has-selection\b/);
  await expect.poll(() => this.page.evaluate(() => getSelection()?.toString())).toBe(text);
});

Then("the workspace caret is collapsed at column {int}", async function (column) {
  await expect(this.page.locator(".editor-status")).toContainText(`Ln 1, Col ${column}`);
  await expect(this.page.locator(".cm-editor")).not.toHaveClass(/\bcm-has-selection\b/);
  await expect.poll(() => this.page.evaluate(() => getSelection()?.isCollapsed)).toBe(true);
});
