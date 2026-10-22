// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const treeRow = (page, path) => page.getByRole("tree", { name: "Repository files", exact: true })
  .getByRole("treeitem", { name: path, exact: true }).locator(":scope > .tree-row");

Given("native context menu handling is observed", async function () {
  await this.page.evaluate(() => {
    globalThis.__contextTargetEvents = [];
    document.addEventListener("contextmenu", event => {
      if (!event.isTrusted) return;
      globalThis.__contextTargetEvents.push(event);
    }, true);
  });
  this.observedContextEvents = 0;
});

When("I right-click the padding of repository row {string}", async function (path) {
  const row = treeRow(this.page, path);
  const bounds = await row.boundingBox();
  assert.ok(bounds);
  await row.click({ button: "right", position: { x: bounds.width - 2, y: bounds.height / 2 } });
});

When("I right-click the icon of repository row {string}", async function (path) {
  await treeRow(this.page, path).locator(":scope > .material-symbols-rounded, :scope > .devicon").click({ button: "right" });
});

When("I right-click the padding of file tab {string}", async function (path) {
  const tab = this.page.locator(".file-tab").filter({
    has: this.page.getByRole("button", { name: `Switch to ${path}`, exact: true }),
  });
  const bounds = await tab.boundingBox();
  assert.ok(bounds);
  await tab.click({ button: "right", position: { x: 2, y: bounds.height / 2 } });
});

When("I right-click the close icon of file tab {string}", async function (path) {
  await this.page.getByRole("button", { name: `Close ${path}`, exact: true })
    .locator(".material-symbols-rounded").click({ button: "right" });
});

Then("the {string} context menu for {string} replaces the browser menu at the pointer", async function (kind, path) {
  const menu = this.page.getByRole("menu", { name: `${kind} actions for ${path}`, exact: true });
  await expect(menu).toBeVisible();
  await expect(this.page.getByRole("menu")).toHaveCount(1);
  const records = await this.page.evaluate(() => globalThis.__contextTargetEvents.map(event => ({
    x: event.clientX, y: event.clientY, prevented: event.defaultPrevented,
  })));
  assert.equal(records.length, this.observedContextEvents + 1, "Every real right-click produces one native context-menu event");
  this.observedContextEvents = records.length;
  const event = records.at(-1);
  assert.equal(event.prevented, true, "The original pointer event must suppress the browser menu");
  const bounds = await menu.boundingBox();
  assert.ok(bounds);
  assert.ok(Math.hypot(bounds.x - event.x, bounds.y - event.y) <= 14,
    `The menu must use the clicked point (${event.x}, ${event.y}), received (${bounds.x}, ${bounds.y})`);
});

When("I dismiss the row or tab context menu", async function () {
  await this.page.keyboard.press("Escape");
  await expect(this.page.getByRole("menu")).toHaveCount(0);
});
