// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const controls = "aside button, .topbar button, .file-tabs button";
const editor = page => page.getByLabel("Code editor document", { exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");
const contents = page => editor(page).locator(".cm-line").allTextContents().then(lines => lines.join("\n"));

Given("the next toolbar {string} is held at the repository worker", async function (operation) {
  assert.ok(["Undo", "Redo"].includes(operation));
  await saved(this.page);
  if (operation === "Redo") {
    await this.page.getByRole("button", { name: "Undo", exact: true }).click();
    await saved(this.page);
  }
  this.historyControlOperation = operation;
  this.historyControlContents = await contents(this.page);
  await this.page.mouse.move(0, 0);
  await this.page.evaluate(({ selector, method }) => {
    const elements = [...document.querySelectorAll(selector)];
    const appearance = element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, foreground: style.color, opacity: style.opacity };
    };
    const baseline = elements.map(appearance);
    const changes = new Map();
    const sample = () => elements.forEach((element, index) => {
      const current = appearance(element);
      if (JSON.stringify(current) !== JSON.stringify(baseline[index])) changes.set(index, {
        name: element.getAttribute("aria-label") || element.textContent.trim(),
        before: baseline[index], after: current,
      });
    });
    const state = { elements, changes, sample, frames: 0, frame: 0 };
    const animate = () => {
      state.frames += 1;
      sample();
      state.frame = requestAnimationFrame(animate);
    };
    state.frame = requestAnimationFrame(animate);
    const observer = new MutationObserver(sample);
    observer.observe(document.querySelector(".app-shell"), { subtree: true, attributes: true });
    globalThis.__historyControlObservation = { state, observer };
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...options) {
      if (message?.method !== method) return send.call(this, message, ...options);
      Worker.prototype.postMessage = send;
      globalThis.__releaseToolbarHistory = () => {
        delete globalThis.__releaseToolbarHistory;
        send.call(this, message, ...options);
      };
    };
  }, { selector: controls, method: `${operation.toLowerCase()}Activity` });
});

When("I start the observed toolbar history operation", async function () {
  await this.page.getByRole("button", { name: this.historyControlOperation, exact: true }).click();
  await this.page.mouse.move(0, 0);
  await expect.poll(() => this.page.evaluate(() => typeof globalThis.__releaseToolbarHistory)).toBe("function");
});

Then("pending history blocks conflicting controls and document edits", async function () {
  await expect(editor(this.page)).toHaveAttribute("aria-readonly", "true");
  const count = await this.page.locator(controls).count();
  assert.ok(count >= 7, "Observe branch, repository, page, file selection, and close buttons");
  assert.equal(await this.page.locator(controls).evaluateAll(elements => elements.every(element => element.disabled)), true,
    "Conflicting controls must stay disabled until Git history finishes");
  await expect(this.page.locator('[role="treeitem"][aria-label="file10.txt"]')).toHaveAttribute("aria-disabled", "true");

  // Actual pointer events avoid bypassing disabled behavior with dispatchEvent.
  for (const selector of [
    '.topbar button[aria-label="Page"]', '.topbar button[aria-label="Repository"]',
    'aside button[aria-label="Branch"]', '.file-tabs button[aria-label="Switch to file10.txt"]',
    '.file-tabs button[aria-label="Close file2.txt"]', '[data-file-path="file10.txt"]',
  ]) {
    const bounds = await this.page.locator(selector).boundingBox();
    assert.ok(bounds);
    await this.page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }
  for (const selector of ['[data-file-path="file2.txt"]', '.file-tabs button[aria-label="Switch to file2.txt"]']) {
    const bounds = await this.page.locator(selector).boundingBox();
    assert.ok(bounds);
    await this.page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { button: "right" });
  }
  await expect(this.page.getByRole("menu")).toHaveCount(0);
  await expect(this.page.getByRole("dialog")).toHaveCount(0);
  await expect(this.page.getByRole("textbox", { name: /^Change name of/ })).toHaveCount(0);
  await expect(this.page.locator('.topbar button[aria-label="Page"]')).toHaveAttribute("data-value", "editor");
  await expect(this.page.locator(".file-tabs button.active")).toHaveAttribute("aria-label", "Switch to file2.txt");
  await expect(this.page.locator('.file-tabs button[aria-label^="Switch to "]')).toHaveCount(2);
  await editor(this.page).click();
  await this.page.keyboard.insertText("blocked");
  assert.equal(await contents(this.page), this.historyControlContents);
  await this.page.mouse.move(0, 0);
});

When("the observed toolbar history operation is released", async function () {
  await this.page.evaluate(() => {
    globalThis.__historyControlObservation.state.sample();
    globalThis.__releaseToolbarHistory();
  });
});

Then("unrelated controls kept their colors throughout the history operation", async function () {
  await saved(this.page);
  await expect(editor(this.page)).toHaveAttribute("aria-readonly", "false");
  const result = await this.page.evaluate(() => {
    const { state, observer } = globalThis.__historyControlObservation;
    state.sample();
    observer.disconnect();
    cancelAnimationFrame(state.frame);
    delete globalThis.__historyControlObservation;
    return { count: state.elements.length, frames: state.frames, changes: [...state.changes.values()],
      enabled: state.elements.every(element => !element.disabled) };
  });
  assert.ok(result.count >= 7 && result.frames > 0);
  assert.equal(result.enabled, true, "Normal control availability resumes after history finishes");
  assert.deepEqual(result.changes, [], "Undo/redo must not flash unrelated buttons or fade their text");
});
