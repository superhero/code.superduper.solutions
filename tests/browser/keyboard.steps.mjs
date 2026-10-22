// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const editor = page => page.getByLabel("Code editor document", { exact: true });
const text = page => editor(page).locator(".cm-line").allTextContents().then(lines => lines.join("\n"));
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");
const contents = value => value.replaceAll("\\n", "\n");

Given("the code editor owns keyboard focus", async function () {
  await editor(this.page).click();
  await expect(editor(this.page)).toBeFocused();
});

// Use page.keyboard throughout: locator.press() would silently refocus the
// editor and conceal the focus loss these scenarios are intended to detect.
When("I press {string} without refocusing the editor", async function (key) {
  await this.page.keyboard.press(key);
});

When("I enter {string} through the focused editor keyboard", async function (value) {
  await this.page.keyboard.insertText(contents(value));
});

Then("the focused code document contains {string} after persistence", async function (value) {
  await expect.poll(() => text(this.page)).toBe(contents(value));
  await saved(this.page);
  await expect(editor(this.page)).toBeFocused();
  await expect(editor(this.page)).toHaveAttribute("aria-readonly", "false");
});

Then("keyboard focus has left the code document", async function () {
  await expect(editor(this.page)).not.toBeFocused();
});

Given("the next keyboard undo is held at the repository worker", async function () {
  await saved(this.page);
  await this.page.evaluate(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...options) {
      if (message?.method !== "undoActivity") return send.call(this, message, ...options);
      Worker.prototype.postMessage = send;
      globalThis.__releaseKeyboardUndo = () => {
        delete globalThis.__releaseKeyboardUndo;
        send.call(this, message, ...options);
      };
    };
  });
});

Then("the pending history keeps the code document focused and read-only", async function () {
  await expect.poll(() => this.page.evaluate(() => typeof globalThis.__releaseKeyboardUndo)).toBe("function");
  await expect(editor(this.page)).toHaveAttribute("aria-readonly", "true");
  await expect(editor(this.page)).toHaveAttribute("contenteditable", "true");
  await expect(editor(this.page)).toBeFocused();
});

Then("the pending code document still contains {string}", async function (value) {
  await expect.poll(() => text(this.page)).toBe(contents(value));
});

When("the held keyboard undo is released", async function () {
  await this.page.evaluate(() => {
    if (!globalThis.__releaseKeyboardUndo) throw new Error("An undo must be held before releasing it");
    globalThis.__releaseKeyboardUndo();
  });
});
