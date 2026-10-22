// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { openNavigationMenu, pageSelector, repositorySelector, selectPage, selectRepository } from "./navigation.helpers.mjs";

const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved", { timeout: 20_000 });

Then("the repository and page dropdowns replace the old navigation controls", async function () {
  const header = this.page.locator(".topbar");
  const repository = repositorySelector(this.page);
  const page = pageSelector(this.page);
  await expect(header.getByRole("button")).toHaveCount(2);
  await expect(header.getByRole("combobox")).toHaveCount(0);
  await expect(header.getByRole("navigation", { name: "Repository navigation", exact: true })).toBeVisible();
  await expect(repository).toBeVisible();
  await expect(page).toBeVisible();
  await expect(this.page.locator("aside").getByRole("combobox", { name: "Repository", exact: true })).toHaveCount(0);
  await expect(this.page.getByRole("tab")).toHaveCount(0);
  await expect(this.page.getByRole("tablist", { name: "Repository views", exact: true })).toHaveCount(0);
  await expect(this.page.locator("aside").getByText("REPOSITORY", { exact: true })).toHaveCount(0);
  await expect(this.page.locator("aside").getByRole("button", { name: "New repository", exact: true })).toHaveCount(0);
  await expect(this.page.locator("aside").getByRole("button", { name: "Import directory", exact: true })).toHaveCount(0);
  const [outer, left, right] = await Promise.all([header.boundingBox(), repository.boundingBox(), page.boundingBox()]);
  assert.ok(left.x >= outer.x && right.x + right.width <= outer.x + outer.width + 1,
    "Both dropdowns must remain inside the header");
  const wraps = await header.locator(".breadcrumb").evaluate(node => getComputedStyle(node).flexWrap === "wrap");
  assert.ok((left.x + left.width <= right.x && Math.abs(left.y - right.y) <= 1)
    || (wraps && right.y >= left.y + left.height),
    "The page follows the repository without overlap, wrapping only when the header allows it");
});

Then("the empty header offers pages without an available repository", async function () {
  await expect(repositorySelector(this.page)).toBeEnabled();
  await expect(repositorySelector(this.page)).toContainText("Choose a repository");
  const menu = await openNavigationMenu(this.page, "Repository");
  await expect(menu.getByRole("menuitemradio")).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "New repository", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Import directory", exact: true })).toBeVisible();
  await this.page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(repositorySelector(this.page)).toBeFocused();
  await expect(pageSelector(this.page)).toBeEnabled();
  await expect(pageSelector(this.page)).toHaveAttribute("data-value", "editor");
});

When("I choose the header page {string} with the keyboard", async function (name) {
  const selector = pageSelector(this.page);
  await selector.focus();
  await selector.press("Enter");
  await expect(this.page.getByRole("menu", { name: "Page", exact: true })).toBeVisible();
  await this.page.keyboard.press("Home");
  const index = ["Editor", "Resources", "Vault", "Settings"].indexOf(name);
  assert.ok(index >= 0);
  for (let count = 0; count < index; count += 1) await this.page.keyboard.press("ArrowDown");
  await this.page.keyboard.press("Enter");
  await expect(this.page.getByRole("menu", { name: "Page", exact: true })).toBeHidden();
  if (name !== "History") await expect(selector).toBeFocused();
});

Then("the header page {string} is active", async function (name) {
  if (name !== "History") await expect(pageSelector(this.page)).toHaveAttribute("data-value", name.toLowerCase());
  await expect(this.page.getByRole("region", { name, exact: true })).toBeVisible();
  await expect(this.page.locator("#panel-editor:visible, #panel-history:visible, #panel-resources:visible, #panel-vault:visible, #panel-settings:visible")).toHaveCount(await this.page.locator("[data-history-panel]:visible").count() ? 2 : 1);
});

async function typeWithPendingWrites(page, value) {
  const input = page.getByLabel("Code editor document", { exact: true });
  await input.click();
  await input.press("Control+End");
  await input.pressSequentially(value);
  await expect(page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("Saving changes…");
}

When("I rapidly type {string} and immediately select header repository {string}", async function (value, name) {
  await typeWithPendingWrites(this.page, value);
  await selectRepository(this.page, name);
});

When("I rapidly type {string} and immediately select header page {string}", async function (value, name) {
  await typeWithPendingWrites(this.page, value);
  await selectPage(this.page, name);
  await saved(this.page);
});

Then("the {string} header menu marks {string} as its only selected choice", async function (name, choice) {
  const menu = await openNavigationMenu(this.page, name);
  const selected = menu.getByRole("menuitemradio", { name: choice, exact: true });
  await expect(selected).toHaveAttribute("aria-checked", "true");
  await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(1);
  await expect(selected.getByText("check", { exact: true })).toBeVisible();
  await this.page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(this.page.getByRole("button", { name, exact: true })).toBeFocused();
});

Then("the {string} header menu uses the context menu colors", async function (name) {
  const menu = await openNavigationMenu(this.page, name);
  const colors = await this.page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const color = token => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    try {
      return { background: color("--tone-5"), foreground: color("--tone-2"),
        hoverBackground: color("--tone-6"), hoverForeground: color("--tone-1") };
    } finally { probe.remove(); }
  });
  await expect(menu).toHaveCSS("background-color", colors.background);
  await expect(menu).toHaveCSS("color", colors.foreground);
  const item = menu.getByRole("menuitemradio").last();
  await item.hover();
  await expect(item).toHaveCSS("background-color", colors.hoverBackground);
  await expect(item).toHaveCSS("color", colors.hoverForeground);
  await this.page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

When("I import a directory through the repository menu", async function () {
  const directory = join(this.artifactDirectory, "menu-import");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "from-menu.txt"), "Imported through the header\n");
  const menu = await openNavigationMenu(this.page, "Repository");
  const [chooser] = await Promise.all([
    this.page.waitForEvent("filechooser"),
    menu.getByRole("menuitem", { name: "Import directory", exact: true }).click(),
  ]);
  assert.equal(await chooser.element().getAttribute("webkitdirectory"), "");
  assert.equal(chooser.isMultiple(), true);
  await expect(menu).toBeHidden();
  await chooser.setFiles(directory);
  await saved(this.page);
  await expect(repositorySelector(this.page)).toContainText("menu-import");
});
