// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { selectPage } from "./navigation.helpers.mjs";

const fileTab = (page, path) => page.getByRole("button", { name: `Switch to ${path}`, exact: true });
const saved = (page, timeout = 5_000) => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved", { timeout });

Given("repository control availability is being observed", async function () {
  await saved(this.page);
  await this.page.evaluate(() => {
    const root = document.querySelector(".app-shell");
    const controls = new Set(root.querySelectorAll("aside button, .topbar button, .file-tabs button"));
    const changed = [];
    const record = records => {
      for (const { target, attributeName, oldValue } of records) {
        if (controls.has(target)) changed.push({
          name: target.getAttribute("aria-label") || target.textContent.trim(),
          attribute: attributeName, before: oldValue, after: target.getAttribute(attributeName),
        });
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(root, { subtree: true, attributes: true, attributeOldValue: true,
      attributeFilter: ["disabled", "aria-disabled"] });
    globalThis.__navigationControls = { observer, record, changed, count: controls.size };
  });
});

When("I switch repository views in this order:", async function (table) {
  for (const { view } of table.hashes()) {
    await selectPage(this.page, view);
  }
  await saved(this.page);
});

When("I choose the open file tab {string}", async function (path) {
  await fileTab(this.page, path).click();
  await saved(this.page);
  await expect(fileTab(this.page, path)).toHaveClass(/\bactive\b/);
});

When("I click the {string} padding of open file tab {string}", async function (edge, path) {
  const tab = this.page.locator(".file-tab").filter({ has: fileTab(this.page, path) });
  const bounds = await tab.boundingBox();
  assert.ok(bounds);
  const points = {
    left: [2, bounds.height / 2], right: [bounds.width - 2, bounds.height / 2],
    "top-left": [2, 1], "top-right": [bounds.width - 2, 1],
    "bottom-left": [2, bounds.height - 1], "bottom-right": [bounds.width - 2, bounds.height - 1],
  };
  assert.ok(points[edge], `Unknown tab padding position: ${edge}`);
  const [x, y] = points[edge];
  await this.page.mouse.click(bounds.x + x, bounds.y + y);
  await saved(this.page);
});

Then("the open file tab {string} keeps its selection background at rest and on hover", async function (path) {
  const button = fileTab(this.page, path);
  const close = this.page.getByRole("button", { name: `Close ${path}`, exact: true });
  const tab = this.page.locator(".file-tab").filter({ has: button });
  const bounds = await tab.boundingBox();
  assert.ok(bounds);
  for (const hover of [
    () => this.page.mouse.move(0, 0),
    () => this.page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2),
    () => button.hover(),
    () => close.hover(),
  ]) {
    await hover();
    await expect.poll(() => tab.evaluate(element => {
      const probe = document.createElement("span");
      probe.style.cssText = "position: absolute; visibility: hidden; pointer-events: none";
      probe.style.background = element.classList.contains("active") ? "var(--color-background)" : "var(--color-hover-background)";
      element.append(probe);
      const selectionBackground = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const switchStyle = getComputedStyle(element.querySelector('[aria-label^="Switch to "]'));
      const closeStyle = getComputedStyle(element.querySelector('[aria-label^="Close "]'));
      return {
        usesSelectionBackground: getComputedStyle(element).backgroundColor === selectionBackground,
        tabOpacity: getComputedStyle(element).opacity,
        switchBackground: switchStyle.backgroundColor,
        switchOpacity: switchStyle.opacity,
        closeBackground: closeStyle.backgroundColor,
        closeOpacity: closeStyle.opacity,
      };
    })).toEqual({
      usesSelectionBackground: true,
      tabOpacity: "1",
      switchBackground: "rgba(0, 0, 0, 0)",
      switchOpacity: "1",
      closeBackground: "rgba(0, 0, 0, 0)",
      closeOpacity: "1",
    });
  }
});

Then("repository controls stayed available during navigation", async function () {
  await saved(this.page);
  const result = await this.page.evaluate(() => {
    const { observer, record, changed, count } = globalThis.__navigationControls;
    record(observer.takeRecords());
    observer.disconnect();
    delete globalThis.__navigationControls;
    return { changed, count };
  });
  assert.ok(result.count >= 7, "Observe the sidebar, header dropdowns, and both open file tabs");
  assert.deepEqual(result.changed, [], "Navigation must not briefly repaint controls as disabled");
});

When("I rapidly type {string} and immediately choose these file tabs:", async function (value, table) {
  const input = this.page.getByLabel("Code editor document", { exact: true });
  await input.click();
  await input.press("Control+End");
  await input.pressSequentially(value);
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("Saving changes…");
  await this.page.evaluate(paths => {
    for (const path of paths) {
      const tab = [...document.querySelectorAll(".file-tabs button")]
        .find(button => button.getAttribute("aria-label") === `Switch to ${path}`);
      if (!tab || tab.disabled) throw new Error(`File tab ${path} must be available while edits save`);
      tab.click();
    }
  }, table.hashes().map(({ path }) => path));
  // This bulk case drains forty durable saves after its immediate tab clicks.
  // Their storage completion is not an assertion about a five-second UI budget.
  await saved(this.page, 30_000);
});

Then("the open file tab {string} is selected", async function (path) {
  await saved(this.page);
  await expect(fileTab(this.page, path)).toHaveClass(/\bactive\b/);
  await expect(this.page.locator(".file-tabs button.active")).toHaveCount(1);
});
