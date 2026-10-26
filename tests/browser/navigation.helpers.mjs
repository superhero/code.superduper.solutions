// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { expect } from "@playwright/test";

export const editorHeading = page => page.locator(".topbar").getByRole("heading", { name: "Editor", exact: true });
export const repositorySelector = page => page.getByRole("button", { name: "Repository", exact: true });

export async function openNavigationMenu(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  const menu = page.getByRole("menu", { name, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

export async function selectSettingsTab(page, name) {
  const tabs=page.getByRole('tablist',{name:'Settings sections',exact:true});
  let button=tabs.getByRole('tab',{name,exact:true});
  if(!await button.count())button=tabs.locator(`[role="tab"][data-value=${JSON.stringify(name)}]`);
  if(await button.getAttribute('aria-selected')!=='true')await button.click();
  await expect(button).toHaveAttribute('aria-selected','true');
  await expect(page.locator(`#${await button.getAttribute('aria-controls')}`)).toBeVisible();
}

export async function selectDropdown(page, name, choice) {
  if(await page.locator('#panel-settings').count()&&!await page.getByRole('dialog').count()){
    const field=page.locator('#panel-settings').getByRole('button',{name,exact:true,includeHidden:true});
    if(await field.count()===1){
      const owner=await field.evaluate(node=>node.closest('[data-settings-section]')?.getAttribute('data-settings-section'));
      if(owner)await selectSettingsTab(page,owner);
    }
  }
  const menu = await openNavigationMenu(page, name);
  const item = typeof choice === "string"
    ? menu.locator(`[role="menuitemradio"][data-value=${JSON.stringify(choice)}]`)
    : menu.getByRole("menuitemradio", { name: choice.label, exact: true });
  await item.click();
  await expect(menu).toBeHidden();
}

export async function addOllamaConnection(page, label = "Local Ollama") {
  await selectPage(page, "Settings", "AI");
  await page.getByRole("button", { name: "New connection", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Remote inference connection", exact: true });
  await dialog.getByRole("textbox", { name: "Connection name", exact: true }).fill(label);
  await dialog.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: `Use ${label}`, exact: true }).click();
}

export async function openStagedHistory(page) {
  if (!await page.locator('[data-history-panel]').count()) await page.getByRole('button',{name:'Open History',exact:true}).click();
  await expect(page.locator('[data-history-panel]')).toBeVisible();
  await page.getByRole('navigation',{name:'History views',exact:true}).getByRole('button',{name:'Staged',exact:true}).click();
}

export async function openGitStaging(page) {
  const panel = page.locator('[data-git-panel]');
  if (!await panel.count()) await page.getByRole('button', { name: 'Git operations', exact: true }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Actions', exact: true }).click();
  await panel.getByRole('button', { name: 'Staging', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Stage all', exact: true })).toBeVisible();
  return panel;
}

export async function selectPage(page, name, settingsSection = "Appearance") {
  if (name === "Vault" || name === "Resources" || name === "Settings") {
    const toggle=page.getByRole("button",{name,exact:true});
    if (name === "Settings" && await toggle.getAttribute("aria-expanded") === "true") { await selectSettingsTab(page,settingsSection); return; }
    // Reopening an existing utility pane gives it priority on smaller screens.
    if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
    await toggle.click();
    await expect(page.getByRole("region",{name,exact:true})).toBeVisible();
    if(name === "Settings")await selectSettingsTab(page,settingsSection);
    return;
  }
  if (name === "History") {
    if (!await page.locator('[data-history-panel]').count()) {
      await selectPage(page,"Editor");
      await openStagedHistory(page);
    }
    await expect(page.locator('[data-history-panel]')).toBeVisible();
    return;
  }
  if (name === "Editor" && await page.getByRole("button", {name:"Settings",exact:true}).getAttribute("aria-expanded") === "true") {
    await page.getByRole("button", {name:"Close Settings",exact:true}).click();
    await expect(page.locator("[data-settings-panel]")).toHaveCount(0);
  }
  expect(name).toBe("Editor");
  await expect(editorHeading(page)).toBeVisible();
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
