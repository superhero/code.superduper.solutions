// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

Given("the shared interface primitives are mounted in an isolated fixture", async function () {
  await this.page.evaluate(async () => (await import("/test-fixtures/ui-primitives.ts")).mountPrimitives());
  await expect(this.page.getByRole("region", { name: "Isolated primitive fixtures" })).toBeVisible();
});
Then("the enabled button activates once from the keyboard", async function () {
  const button = this.page.getByRole("button", { name: "Enabled action", exact: true });
  await button.focus();
  await button.press("Enter");
  await expect(this.page.getByRole("status", { name: "Action count" })).toHaveText("1");
});
Then("the disabled action remains inactive and exposes its explanatory tooltip", async function () {
  const button = this.page.getByRole("button", { name: "Disabled action", exact: true });
  await expect(button).toBeDisabled();
  await button.hover();
  await expect(this.page.getByRole("tooltip")).toContainText("Unavailable until a project is open");
  const box = await button.boundingBox();
  assert.ok(box);
  await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(this.page.getByRole("status", { name: "Action count" })).toHaveText("0");
});
Then("the disabled destination has no navigation target or keyboard tab stop", async function () {
  const link = this.page.getByRole("link", { name: "Disabled destination", exact: true });
  await expect(link).toHaveAttribute("aria-disabled", "true");
  await expect(link).toHaveAttribute("tabindex", "-1");
  assert.equal(await link.getAttribute("href"), null);
  await this.page.getByRole("button", { name: "Enabled action", exact: true }).focus();
  await this.page.keyboard.press("Tab");
  await expect(this.page.getByRole("button", { name: "Described action", exact: true })).toBeFocused();
  assert.equal(new URL(this.page.url()).hash, "");
});
Then("the described action keeps its name while exposing help on keyboard focus", async function () {
  const button = this.page.getByRole("button", { name: "Described action", exact: true });
  await button.focus();
  await expect(button).toHaveAccessibleName("Described action");
  await expect(this.page.getByRole("tooltip")).toContainText("Helpful action description");
  await button.press("Tab");
  await expect(this.page.getByRole("tooltip")).toHaveCount(0);
});
Then("a focused tooltip lets clicks reach an overlapping action", async function () {
  await this.page.getByRole("button", { name: "Described action", exact: true }).focus();
  const tooltip = this.page.getByRole("tooltip");
  await expect(tooltip).toContainText("Helpful action description");
  const bounds = await tooltip.boundingBox(); assert.ok(bounds);
  const action = this.page.getByRole("button", { name: "Enabled action", exact: true });
  // Place the existing fixture action under the popup, reproducing dense toolbar overlap.
  await action.evaluate((node, bounds) => {
    const rect = node.getBoundingClientRect();
    Object.assign(node.style, { position: "relative", zIndex: "0",
      transform: `translate(${bounds.x + bounds.width / 2 - rect.x - rect.width / 2}px, ${bounds.y + bounds.height / 2 - rect.y - rect.height / 2}px)` });
  }, bounds);
  assert.ok(await action.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest("button") === node;
  }), "The explanatory popup must not intercept a control underneath it");
  await this.page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(this.page.getByRole("status", { name: "Action count" })).toHaveText("1");
});
When("the fixture panel is opened", async function () {
  await this.page.getByRole("button", { name: "Open fixture panel", exact: true }).click();
  await expect(this.page.getByRole("dialog", { name: "Fixture panel", exact: true })).toBeVisible();
});
Then("keyboard focus wraps within the panel", async function () {
  const panel = this.page.getByRole("dialog", { name: "Fixture panel", exact: true });
  const field = panel.getByRole("textbox", { name: "Fixture value", exact: true });
  const close = panel.getByRole("button", { name: "Close", exact: true });
  await field.focus();
  await field.press("Shift+Tab");
  await expect(close).toBeFocused();
  await close.press("Tab");
  await expect(field).toBeFocused();
});
Then("Escape closes the panel and restores its trigger focus", async function () {
  await this.page.keyboard.press("Escape");
  await expect(this.page.getByRole("dialog", { name: "Fixture panel", exact: true })).toHaveCount(0);
  await expect(this.page.getByRole("button", { name: "Open fixture panel", exact: true })).toBeFocused();
});
Then("the named close control dismisses the panel and restores trigger focus", async function () {
  await this.page.getByRole("dialog", { name: "Fixture panel", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(this.page.getByRole("dialog", { name: "Fixture panel", exact: true })).toHaveCount(0);
  await expect(this.page.getByRole("button", { name: "Open fixture panel", exact: true })).toBeFocused();
});

async function expectStableHoverAndFocus(page, button, width) {
  await page.mouse.move(0, 0);
  await button.evaluate((element, value) => { element.style.width = `${value}px`; }, width);
  const dimensions = () => button.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  const original = await dimensions();
  const unchanged = async () => {
    await expect(button).toHaveCSS("transform", "none");
    await expect(button).toHaveCSS("scale", "none");
    assert.deepEqual(await dimensions(), original, "Hover and focus must preserve button dimensions");
  };
  await button.hover();
  await unchanged();
  await button.focus();
  await unchanged();
}

Then("shared buttons keep their size on hover and focus after resizing", async function () {
  await this.page.emulateMedia({ reducedMotion: "no-preference" });
  const button = this.page.getByRole("button", { name: "Enabled action", exact: true });
  await expectStableHoverAndFocus(this.page, button, 400);
  await expectStableHoverAndFocus(this.page, button, 240);
});
Then("shared button size stays stable with reduced motion", async function () {
  await this.page.emulateMedia({ reducedMotion: "reduce" });
  await expectStableHoverAndFocus(this.page,
    this.page.getByRole("button", { name: "Enabled action", exact: true }), 240);
});
Then("panel buttons keep their size on hover and focus after resizing", async function () {
  await this.page.emulateMedia({ reducedMotion: "no-preference" });
  const button = this.page.getByRole("dialog", { name: "Fixture panel", exact: true })
    .getByRole("button", { name: "Panel action", exact: true });
  await expectStableHoverAndFocus(this.page, button, 280);
  await expectStableHoverAndFocus(this.page, button, 180);
});
