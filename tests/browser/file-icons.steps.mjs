// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const treeRow = (page, path) => page.getByRole("tree", { name: "Repository files", exact: true })
  .getByRole("treeitem", { name: path, exact: true }).locator(":scope > .tree-row");
const fileTab = (page, path) => page.getByRole("button", { name: `Switch to ${path}`, exact: true });
const devicon = (container, name) => container.locator(`.devicon[data-file-icon="${name}"]`);

async function expectDevicon(icon, size) {
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect(icon).toHaveCSS("font-family", "Devicon");
  await expect(icon).toHaveCSS("font-size", `${size}px`);
  const glyph = await icon.textContent();
  assert.equal([...glyph].length, 1, "A file icon renders one font glyph");
  return glyph;
}

async function expectMaterialIcon(icon, name, size) {
  await expect(icon).toBeVisible();
  await expect(icon).toHaveText(name);
  await expect(icon).toHaveAttribute("aria-hidden", "true");
  await expect(icon).toHaveCSS("font-family", '"Material Symbols Rounded"');
  await expect(icon).toHaveCSS("font-size", `${size}px`);
  const rendered = await icon.evaluate(async (element, { name, size }) => {
    const family = '"Material Symbols Rounded"';
    const faces = await document.fonts.load(`${size}px ${family}`, name);
    const images = [family, "sans-serif"].map(font => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 32;
      const context = canvas.getContext("2d");
      context.font = `24px ${font}`;
      context.fillText(name, 0, 26);
      return canvas.toDataURL();
    });
    return { faces: faces.map(face => ({ family: face.family, status: face.status })),
      width: element.getBoundingClientRect().width, images };
  }, { name, size });
  assert.ok(rendered.faces.length > 0, "The standalone page contains a matching Material font face");
  for (const face of rendered.faces) {
    assert.equal(face.family.replaceAll('"', ""), "Material Symbols Rounded");
    assert.equal(face.status, "loaded");
  }
  assert.ok(Math.abs(rendered.width - size) < 0.1, "The icon renders as one ligature, not its fallback text");
  assert.notEqual(rendered.images[0], rendered.images[1], "The loaded Material glyph differs from fallback text");
}

async function expectFilenameColor(container, icon, name) {
  const label = name ? container.getByText(name, { exact: true }) : container;
  const color = await label.evaluate(element => getComputedStyle(element).color);
  await expect(icon).toHaveCSS("color", color);
  assert.notEqual(color, "rgba(0, 0, 0, 0)", "The filename and icon remain visible");
}

When("I import a directory with varied file icon types", async function () {
  const directory = join(this.artifactDirectory, "file-icons-project");
  const files = {
    "main.ts": "export const answer = 42;\n",
    "helper.js": "export const helper = true;\n",
    "main.test.ts": "export const test = true;\n",
    "helper.spec.js": "export const spec = true;\n",
    "App.svelte": "<h1>Hello</h1>\n",
    "script.py": "print('Hello')\n",
    "notes.unknown": "Unknown file type\n",
    "folder/nested.txt": "Nested file\n",
  };
  for (const [path, content] of Object.entries(files)) {
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await this.page.getByLabel("Import repository", { exact: true }).setInputFiles(directory);
  await expect(treeRow(this.page, "main.ts")).toBeVisible();
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
});

Then("the repository tree renders distinct bundled Devicon glyphs:", async function (table) {
  const glyphs = [];
  await this.page.mouse.move(0, 0);
  for (const { path, icon: name } of table.hashes()) {
    const row = treeRow(this.page, path);
    const icon = devicon(row, name);
    glyphs.push(await expectDevicon(icon, 16));
    await expectFilenameColor(row, icon, path);
  }
  assert.equal(new Set(glyphs).size, glyphs.length, "Each represented language has a distinct glyph");
  const rendered = await this.page.evaluate(async characters => {
    const faces = await document.fonts.load("16px Devicon", characters.join(""));
    const images = characters.map(character => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const context = canvas.getContext("2d");
      context.font = "24px Devicon";
      context.fillText(character, 0, 26);
      return canvas.toDataURL();
    });
    return { faces: faces.map(face => ({ family: face.family, status: face.status })), images };
  }, glyphs);
  assert.ok(rendered.faces.length > 0, "The standalone page contains a matching Devicon font face");
  for (const face of rendered.faces) {
    assert.equal(face.family.replaceAll('"', ""), "Devicon");
    assert.equal(face.status, "loaded");
  }
  assert.equal(new Set(rendered.images).size, glyphs.length, "Loaded language glyphs render different shapes");
});

Then("the file icon for {string} inherits its filename color normally and on hover", async function (path) {
  const row = treeRow(this.page, path);
  const icon = row.locator(".devicon");
  await this.page.mouse.move(0, 0);
  await expectFilenameColor(row, icon, path);
  await row.hover();
  assert.equal(await row.evaluate(element => element.matches(":hover")), true);
  await expectFilenameColor(row, icon, path);
  await this.page.mouse.move(0, 0);
});

Then("the repository tree item {string} uses the Material icon {string}", async function (path, name) {
  const row = treeRow(this.page, path);
  const icon = row.locator(":scope > .material-symbols-rounded");
  await expectMaterialIcon(icon, name, 16);
  await expect(row.locator(".devicon")).toHaveCount(0);
});

Then("the tree and open tab for {string} share the Material glyph {string}", async function (path, name) {
  const row = treeRow(this.page, path);
  const tab = fileTab(this.page, path);
  const treeIcon = row.locator(":scope > .material-symbols-rounded");
  const tabIcon = tab.locator(":scope > .material-symbols-rounded");
  await expect(tab).toHaveClass(/\bactive\b/);
  await expectMaterialIcon(treeIcon, name, 16);
  await expectMaterialIcon(tabIcon, name, 15);
  await expectFilenameColor(row, treeIcon, path);
  await expectFilenameColor(tab, tabIcon);
});

Then("the tree and open tab for {string} share the Devicon glyph {string}", async function (path, name) {
  const row = treeRow(this.page, path);
  const tab = fileTab(this.page, path);
  const treeIcon = devicon(row, name);
  const tabIcon = devicon(tab, name);
  await expect(tab).toHaveClass(/\bactive\b/);
  const treeGlyph = await expectDevicon(treeIcon, 16);
  assert.equal(await expectDevicon(tabIcon, 15), treeGlyph);
  await expectFilenameColor(row, treeIcon, path);
  await expectFilenameColor(tab, tabIcon);
});

Then("the file icons are captured", async function () {
  await this.page.mouse.move(0, 0);
  const screenshot = await this.page.screenshot({ path: join(this.artifactDirectory, "file-icons.png") });
  await this.attach(screenshot, "image/png");
});
