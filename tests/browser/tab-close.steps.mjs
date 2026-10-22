// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const fileTab = (page, path) => page.getByRole("button", { name: `Switch to ${path}`, exact: true });
const closeTab = (page, path) => page.getByRole("button", { name: `Close ${path}`, exact: true });
const input = page => page.getByLabel("Code editor document", { exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");

When("I close the file tab {string}", async function (path) {
  await closeTab(this.page, path).click();
  await saved(this.page);
  await expect(fileTab(this.page, path)).toHaveCount(0);
  await expect(closeTab(this.page, path)).toHaveCount(0);
});

When("I rapidly type {string} and immediately close the file tab {string}", async function (text, path) {
  await input(this.page).click();
  await input(this.page).press("Control+End");
  await input(this.page).pressSequentially(text);
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("Saving changes…");
  await closeTab(this.page, path).evaluate(button => {
    if (button.disabled) throw new Error("Closing must remain available while accepted edits are saving");
    button.click();
  });
});

When("I close the file tab {string} using the keyboard", async function (path) {
  await closeTab(this.page, path).focus();
  await closeTab(this.page, path).press("Enter");
  await saved(this.page);
  await expect(fileTab(this.page, path)).toHaveCount(0);
});

Then("the open file tab {string} has keyboard focus", async function (path) {
  await expect(fileTab(this.page, path)).toBeFocused();
  await expect(fileTab(this.page, path)).toHaveClass(/\bactive\b/);
});

Then("the empty editor panel has keyboard focus", async function () {
  await expect(this.page.getByRole("region", { name: "Editor", exact: true })).toBeFocused();
});

Given("the stale tab's next save is held until closing starts", async function () {
  await this.otherPage.evaluate(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...options) {
      if (message?.method !== "recordActivity" || message.args[0].command?.method !== "write") return send.call(this, message, ...options);
      Worker.prototype.postMessage = send;
      globalThis.__releaseTabCloseSave = () => {
        delete globalThis.__releaseTabCloseSave;
        send.call(this, message, ...options);
      };
    };
  });
});

When("I request closing the stale file tab {string} and release its pending save", async function (path) {
  await expect(this.otherPage.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("Saving changes…");
  await closeTab(this.otherPage, path).evaluate(button => {
    if (button.disabled || !globalThis.__releaseTabCloseSave) throw new Error("The stale write must still be pending when close is requested");
    button.click();
    globalThis.__releaseTabCloseSave();
  });
});

Then("the stale file tab {string} retains its unsaved text {string}", async function (path, text) {
  await expect(this.otherPage.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("Changes not saved");
  await expect(this.otherPage.getByRole("alert")).toContainText(/could not be saved|changed|stale|another tab/i);
  await expect(fileTab(this.otherPage, path)).toBeVisible();
  await expect(fileTab(this.otherPage, path)).toHaveClass(/\bactive\b/);
  await expect(closeTab(this.otherPage, path)).toBeDisabled();
  await expect.poll(() => input(this.otherPage).locator(".cm-line").allTextContents()
    .then(lines => lines.join("\n"))).toBe(text);
});
