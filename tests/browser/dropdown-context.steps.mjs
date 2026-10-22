// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { openNavigationMenu } from "./navigation.helpers.mjs";

const trigger = (page, name) => page.getByRole("button", { name, exact: true });
const menu = (page, name) => page.getByRole("menu", { name, exact: true });

async function menuState(page, name) {
  return menu(page, name).evaluate(element => ({
    choices: [...element.querySelectorAll('[role="menuitemradio"]')].map(item => ({
      name: item.querySelector(".menu-choice").textContent,
      checked: item.getAttribute("aria-checked"),
    })),
    actions: [...element.querySelectorAll('[role="menuitem"]')].map(item => item.querySelector(".menu-choice").textContent),
  }));
}

async function selectionState(page) {
  return page.evaluate(() => ({
    dropdowns: [...document.querySelectorAll(".navigation-trigger")].map(element => ({
      name: element.getAttribute("aria-label"), value: element.dataset.value,
    })),
    file: document.querySelector(".file-tabs button.active")?.getAttribute("aria-label"),
  }));
}

Given("the normal {string} dropdown menu is recorded", async function (name) {
  this.dropdownSelectionBefore = await selectionState(this.page);
  const popup = await openNavigationMenu(this.page, name);
  this.normalDropdownMenu = await menuState(this.page, name);
  assert.equal(this.normalDropdownMenu.choices.filter(choice => choice.checked === "true").length, 1);
  await this.page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(trigger(this.page, name)).toBeFocused();
});

When("I right-click the icon of the {string} dropdown", async function (name) {
  await trigger(this.page, name).locator(".material-symbols-rounded").first().click({ button: "right" });
});

When("I right-click the text of the already open {string} dropdown", async function (name) {
  await expect(menu(this.page, name)).toBeVisible();
  const bounds = await trigger(this.page, name).locator(".navigation-label").boundingBox();
  assert.ok(bounds);
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await this.page.mouse.click(point.x, point.y, { button: "right" });
});

Then("the {string} dropdown shows the same menu and suppresses the browser menu", async function (name) {
  const popup = menu(this.page, name);
  await expect(popup).toBeVisible();
  await expect(this.page.getByRole("menu")).toHaveCount(1);
  await expect(this.page.getByRole("menu", { name: "Repository actions", exact: true })).toHaveCount(0);
  assert.deepEqual(await menuState(this.page, name), this.normalDropdownMenu);
  await expect(popup.locator('[role="menuitemradio"][aria-checked="true"]').getByText("check", { exact: true })).toBeVisible();
  assert.deepEqual(await selectionState(this.page), this.dropdownSelectionBefore);
  const events = await this.page.evaluate(() => globalThis.__contextTargetEvents.map(event => ({
    prevented: event.defaultPrevented, trigger: event.target.closest(".navigation-trigger")?.getAttribute("aria-label"),
  })));
  assert.equal(events.length, this.observedContextEvents + 1, "Each right-click dispatches one real pointer context event");
  this.observedContextEvents = events.length;
  assert.deepEqual(events.at(-1), { prevented: true, trigger: name });
});

When("I dismiss the {string} dropdown with Escape", async function (name) {
  await this.page.keyboard.press("Escape");
  await expect(menu(this.page, name)).toBeHidden();
  await expect(trigger(this.page, name)).toBeFocused();
});
