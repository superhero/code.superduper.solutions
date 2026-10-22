// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { expect } from "@playwright/test";

export const pageSelector = page => page.getByRole("button", { name: "Page", exact: true });
export const repositorySelector = page => page.getByRole("button", { name: "Repository", exact: true });

export async function openNavigationMenu(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  const menu = page.getByRole("menu", { name, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

export async function selectDropdown(page, name, choice) {
  const menu = await openNavigationMenu(page, name);
  const item = typeof choice === "string"
    ? menu.locator(`[role="menuitemradio"][data-value=${JSON.stringify(choice)}]`)
    : menu.getByRole("menuitemradio", { name: choice.label, exact: true });
  await item.click();
  await expect(menu).toBeHidden();
}

export async function selectPage(page, name) {
  if (name === "History") {
    if (!await page.locator('[data-history-panel]').count()) {
      await selectPage(page,"Editor");
      await page.getByRole("button",{name:"Open staged history",exact:true}).click();
    }
    await expect(page.locator('[data-history-panel]')).toBeVisible();
    return;
  }
  const menu = await openNavigationMenu(page, "Page");
  await menu.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(pageSelector(page)).toHaveAttribute("data-value", name.toLowerCase());
  await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
}

export async function selectRepository(page, name) {
  const menu = await openNavigationMenu(page, "Repository");
  await menu.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("All changes saved", { timeout: 20_000 });
  await expect(repositorySelector(page)).toContainText(name);
}

export async function repositoryOptions(page) {
  const menu = await openNavigationMenu(page, "Repository");
  const options = await menu.getByRole("menuitemradio").locator(".menu-choice").allTextContents();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  return options;
}

export async function repositoryAction(page, name) {
  const menu = await openNavigationMenu(page, "Repository");
  await menu.getByRole("menuitem", { name, exact: true }).click();
  await expect(menu).toBeHidden();
}
