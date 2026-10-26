// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { openNavigationMenu, selectDropdown, selectSettingsTab } from "./navigation.helpers.mjs";

async function expectBorderless(locator, label) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate(element => {
    const computed = getComputedStyle(element);
    return {
      borders: [computed.borderTopWidth, computed.borderRightWidth, computed.borderBottomWidth, computed.borderLeftWidth],
      outlineStyle: computed.outlineStyle,
      outlineWidth: computed.outlineWidth,
      boxShadow: computed.boxShadow,
    };
  });
  assert.deepEqual(style.borders, ["0px", "0px", "0px", "0px"], `${label} has no border on any side`);
  assert.ok(style.outlineStyle === "none" || style.outlineWidth === "0px", `${label} has no outline: ${JSON.stringify(style)}`);
  // Floating surfaces may retain soft depth shadows, but sharp spread shadows
  // must not reintroduce a focus ring under a different CSS property.
  const rings = style.boxShadow.split(/,(?![^()]*\))/).filter(shadow => {
    if (/rgba\([^)]*,\s*0\s*\)/.test(shadow)) return false;
    const lengths = shadow.replace(/(?:rgb|hsl)a?\([^)]*\)/g, "").match(/-?\d+(?:\.\d+)?px/g)?.map(Number.parseFloat);
    return lengths?.length >= 4 && lengths[0] === 0 && lengths[1] === 0 && lengths[2] === 0 && lengths[3] !== 0;
  });
  assert.deepEqual(rings, [], `${label} has no ring-shaped box shadow: ${style.boxShadow}`);
}

async function expectFocusedBorderless(locator, label) {
  await locator.focus();
  await expect(locator).toBeFocused();
  await expectBorderless(locator, label);
}

Then("the filename row and open tab for {string} stay borderless when focused", async function (path) {
  await this.page.keyboard.press("Tab");
  const item = this.page.getByRole("tree", { name: "Repository files", exact: true })
    .getByRole("treeitem", { name: path, exact: true });
  await expectFocusedBorderless(item, "Focused tree item");
  await expectBorderless(item.locator(":scope > .tree-row"), "Focused filename row");
  await expectFocusedBorderless(item.locator(".file-name-text"), "Focused filename trigger");
  const tab = this.page.getByRole("button", { name: `Switch to ${path}`, exact: true });
  await expectFocusedBorderless(tab, "Focused file tab button");
  await expectBorderless(this.page.locator(".file-tab").filter({ has: tab }), "Active file tab surface");
  await expectFocusedBorderless(this.page.getByRole("button", { name: `Close ${path}`, exact: true }), "Focused file tab close button");
});

Then("the filename menu for {string} and its focused actions are borderless", async function (path) {
  const menu = this.page.getByRole("menu", { name: `File actions for ${path}`, exact: true });
  await expectBorderless(menu, "Filename context menu");
  await this.page.keyboard.press("ArrowDown");
  for (const name of ["Change name", "Delete file"]) {
    await expectFocusedBorderless(menu.getByRole("menuitem", { name, exact: true }), `Focused ${name} action`);
  }
});

Then("the focused filename editor for {string} is borderless", async function (path) {
  const input = this.page.getByRole("textbox", { name: `Change name of ${path}`, exact: true });
  await expect(input).toBeFocused();
  await expectBorderless(input, "Focused filename editor");
});

Then("the deletion dialog has the shared frame and borderless focused buttons", async function () {
  const dialog = this.page.getByRole("dialog", { name: "Delete file", exact: true });
  await expect(dialog).toHaveCSS('border-top-width','2px');await expect(dialog).toHaveCSS('box-shadow','none');
  await this.page.keyboard.press("Tab");
  for (const name of ["Cancel", "Delete", "Close"]) {
    await expectFocusedBorderless(dialog.getByRole("button", { name, exact: true }), `Focused dialog ${name} button`);
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).press("Enter");
  await expect(dialog).toBeHidden();
});

Then("Settings surfaces and focused form controls are borderless", async function () {
  const settings = this.page.getByRole("region", { name: "Settings", exact: true });
  for (const selector of [".settings-page", ".settings-fields", ".settings-card"]) {
    const surfaces = settings.locator(`${selector}:visible`);
    assert.ok(await surfaces.count() > 0, `${selector} is rendered`);
    for (const surface of await surfaces.all()) await expectBorderless(surface, selector);
  }
  await this.page.keyboard.press("Tab");
  await expectFocusedBorderless(this.page.getByRole("button", { name: "Settings scope", exact: true }), "Focused Settings scope dropdown");
  for (const name of ["Color mode", "Font size"]) {
    await expectFocusedBorderless(settings.getByLabel(name, { exact: true }), `Focused ${name} control`);
  }
  await selectSettingsTab(this.page, "Editor");
  await expectFocusedBorderless(settings.getByLabel("Line wrapping", { exact: true }), "Focused Line wrapping control");
  await selectSettingsTab(this.page, "Controls");
  await settings.getByRole('switch',{name:'Reset settings',exact:true}).check();
  const reset = this.page.locator(".settings-toolbar").getByRole("button", { name: "Reset global defaults", exact: true });
  await expectFocusedBorderless(reset, "Focused Reset global defaults button");
  await expect(reset.locator(".material-symbols-rounded")).toHaveText("reset_settings");
});

Then("CodeMirror retains a visible matching-token outline", async function () {
  const editor = this.page.locator(".cm-editor");
  await expect(editor.locator(".cm-selectionMatch")).toHaveText("const");
  const outline = editor.locator(".cm-selectionMatchOutline");
  await expect(outline).toHaveCount(1);
  await expect(outline).toBeVisible();
  await expect(outline).toHaveCSS("outline-style", "solid");
  await expect(outline).toHaveCSS("outline-width", "1px");
});

Then("Settings choices match header menus and support keyboard selection", async function () {
  const page = this.page;
  const headerMenu = await openNavigationMenu(page, "Settings scope");
  const appearance = await headerMenu.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.backgroundColor, style.color, style.fontWeight];
  });
  await page.keyboard.press("Escape");
  await expect(headerMenu).toBeHidden();
  const settings = page.getByRole("region", { name: "Settings", exact: true });
  await expect(settings.getByRole("combobox")).toHaveCount(0);
  for (const name of ["Color mode", "Palette", "Editor font", "Indentation"]) {
    await selectSettingsTab(page,name === "Indentation" ? "Editor" : "Appearance");
    const trigger = settings.getByRole("button", { name, exact: true });
    await expect(trigger).toHaveCSS("font-weight", "700");
    const selected = await trigger.getAttribute("data-value");
    const menu = await openNavigationMenu(page, name);
    assert.deepEqual(await menu.evaluate(element => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.color, style.fontWeight];
    }), appearance);
    const checked = menu.getByRole("menuitemradio", { checked: true });
    await expect(checked).toHaveCount(1);
    await expect(checked).toHaveAttribute("data-value", selected);
    await expect(checked.locator(".menu-check .material-symbols-rounded")).toHaveText("check");
    await expectBorderless(menu, `${name} dropdown menu`);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  }
  await selectSettingsTab(page,"Appearance");
  const mode = settings.getByRole("button", { name: "Color mode", exact: true });
  await mode.press("Enter");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(mode).toHaveAttribute("data-value", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await selectSettingsTab(page,"Editor");
  await selectDropdown(page, "Indentation", "tabs");
  await expect(settings.getByRole("button", { name: "Indentation", exact: true })).toHaveAttribute("data-value", "tabs");
  await expect(page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
});
