// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { openNavigationMenu } from "./navigation.helpers.mjs";

const branchTrigger = page => page.getByRole("button", { name: "Branch", exact: true });
const branchDialog = page => page.getByRole("dialog", { name: "New branch", exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved", { timeout: 20_000 });

When("I request a new branch named {string}", async function (name) {
  const menu = await openNavigationMenu(this.page, "Branch");
  await menu.getByRole("menuitem", { name: "New branch", exact: true }).click();
  await expect(menu).toBeHidden();
  const dialog = branchDialog(this.page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Branch name", exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Create branch", exact: true }).click();
});

Then("the active branch is {string}", async function (name) {
  await saved(this.page);
  await expect(branchDialog(this.page)).toBeHidden();
  await expect(this.page.locator("aside").getByRole("button", { name: "Branch", exact: true })).toBeVisible();
  await expect(branchTrigger(this.page)).toHaveAttribute("data-value", name);
  await expect(branchTrigger(this.page).locator(".navigation-label")).toHaveText(name);
});

Then("the branch menu lists these local branches with {string} selected:", async function (selected, table) {
  const menu = await openNavigationMenu(this.page, "Branch");
  const choices = menu.getByRole("menuitemradio");
  const expected = table.hashes().map(({ branch }) => branch);
  assert.deepEqual((await choices.locator(".menu-choice").allTextContents()).sort(), expected.sort());
  const checked = menu.getByRole("menuitemradio", { name: selected, exact: true });
  await expect(checked).toHaveAttribute("aria-checked", "true");
  await expect(checked.getByText("check", { exact: true })).toBeVisible();
  await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(1);
  const action = menu.getByRole("menuitem", { name: "New branch", exact: true });
  await expect(action.getByText("account_tree", { exact: true })).toBeVisible();
  await expect(menu.getByRole("separator")).toHaveCount(1);
  await expect(menu.getByRole("separator")).toBeVisible();
  assert.equal(await menu.evaluate(element => {
    const choices = [...element.querySelectorAll('[role="menuitemradio"]')];
    const separator = element.querySelector('[role="separator"]');
    const action = element.querySelector('[role="menuitem"]');
    return choices.every(choice => choice.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING)
      && Boolean(separator.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING);
  }), true, "The separator follows local branches and precedes New branch");
  await this.page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(branchTrigger(this.page)).toBeFocused();
});

When("I choose the local branch {string}", async function (name) {
  const menu = await openNavigationMenu(this.page, "Branch");
  await menu.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(menu).toBeHidden();
  await saved(this.page);
});

Then("the source commit messages are:", async function (table) {
  await saved(this.page);
  await expect.poll(async () => (await repositorySnapshot(this.page)).commits.map(entry => entry.message.trim()))
    .toEqual(table.hashes().map(({ message }) => message));
});

Then("switching branches reports uncommitted changes", async function () {
  if (this.checkoutError) { assert.match(this.checkoutError,/uncommitted|commit.*before|dirty/i);this.checkoutError=undefined;return; }
  await expect(this.page.getByRole("alert")).toContainText(/uncommitted|commit.*before|dirty/i);
});

Then("the new branch form rejects {string} as {string}", async function (name, reason) {
  const dialog = branchDialog(this.page);
  await expect(dialog).toBeVisible();
  const message = { invalid: /invalid|branch name/i, duplicate: /already exists/i, unborn: /initial commit|commit.*before/i }[reason];
  assert.ok(message, `Unknown branch failure: ${reason}`);
  await expect(dialog.getByRole("alert")).toContainText(message);
  await expect(dialog.getByRole("textbox", { name: "Branch name", exact: true })).toHaveValue(name);
  await expect(dialog.getByRole("textbox", { name: "Branch name", exact: true })).toBeEditable();
  await expect(dialog.getByRole("button", { name: "Create branch", exact: true })).toBeEnabled();
});

When("I cancel the new branch form", async function () {
  await branchDialog(this.page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(branchDialog(this.page)).toBeHidden();
  await saved(this.page);
});
