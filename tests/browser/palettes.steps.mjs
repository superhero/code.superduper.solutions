// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { editorHeading, selectPage } from "./navigation.helpers.mjs";

const luminance = channels => channels.slice(0, 3).map(value => value / 255)
  .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

function assertReadable(bg, fg, label) {
  assert.equal(bg[3], 255, `${label} background must be opaque`);
  assert.equal(fg[3], 255, `${label} foreground must be opaque`);
  const a = luminance(bg), b = luminance(fg);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  assert.ok(ratio >= 4.5, `${label} contrast is ${ratio.toFixed(3)}:1`);
}

When("the editor palette is {string} in {string} mode", async function (palette, mode) {
  await expect(this.page.getByRole("button", { name: "Repository", exact: true })).toBeEnabled();
  await this.page.evaluate(({ palette, mode }) => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = mode;
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, { palette, mode });
});

Then("every editor text role has at least four and a half to one contrast", async function () {
  const colors = await this.page.evaluate(() => {
    const pairs = [
      ["background", "foreground"], ["surface", "foreground"], ["primary", "primary-foreground"],
      ["badge-background", "badge-foreground"], ["disabled", "disabled-foreground"],
      ["secondary-hover", "secondary-hover-foreground"], ["selection-background", "selection-foreground"],
      ["error-background", "error-foreground"], ["muted", "muted-foreground"]
    ];
    const root = document.documentElement;
    const probe = document.createElement("span");
    root.append(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const drawing = canvas.getContext("2d", { willReadFrequently: true });
    const read = role => {
      const token = `--color-${role}`;
      if (!getComputedStyle(root).getPropertyValue(token).trim()) throw new Error(`Missing semantic role: ${token}`);
      probe.style.color = `var(${token})`;
      drawing.clearRect(0, 0, 1, 1);
      drawing.fillStyle = getComputedStyle(probe).color;
      drawing.fillRect(0, 0, 1, 1);
      return [...drawing.getImageData(0, 0, 1, 1).data];
    };
    const result = { palette: root.dataset.palette, mode: root.dataset.theme,
      pairs: pairs.map(([background, foreground]) => ({ background, foreground, bg: read(background), fg: read(foreground) })) };
    probe.remove();
    return result;
  });
  for (const { background, foreground, bg, fg } of colors.pairs) {
    assertReadable(bg, fg, `${colors.palette}/${colors.mode}: ${background}/${foreground}`);
  }
});

Then("the Editor heading keeps readable text", async function () {
  await selectPage(this.page, "Settings");
  const colors = await editorHeading(this.page).evaluate(element => {
    const styles = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const drawing = canvas.getContext("2d", { willReadFrequently: true });
    const read = color => {
      drawing.clearRect(0, 0, 1, 1);
      drawing.fillStyle = color;
      drawing.fillRect(0, 0, 1, 1);
      return [...drawing.getImageData(0, 0, 1, 1).data];
    };
    // Header labels inherit their visible background from their ancestors.
    // Composite those layers before measuring the text's actual contrast.
    const ancestors = [];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) ancestors.unshift(ancestor);
    drawing.clearRect(0, 0, 1, 1);
    for (const ancestor of ancestors) {
      drawing.fillStyle = getComputedStyle(ancestor).backgroundColor;
      drawing.fillRect(0, 0, 1, 1);
    }
    const bg = [...drawing.getImageData(0, 0, 1, 1).data];
    return { bg, fg: read(styles.color), opacity: styles.opacity,
      palette: document.documentElement.dataset.palette, mode: document.documentElement.dataset.theme };
  });
  assert.equal(colors.opacity, "1", "The Editor heading must not fade its text contrast");
  assertReadable(colors.bg, colors.fg, `${colors.palette}/${colors.mode}: Editor heading beside Settings`);
});

Then("the palette selector offers every shipped palette exactly once", async function () {
  await selectPage(this.page, "Settings");
  const source = await readFile("src/palette.css", "utf8");
  const names = [...source.matchAll(/\[data-palette-preview="([^"]+)"\]/g)].map(match => match[1]);
  await this.page.getByRole('button',{name:'Palette',exact:true}).click();
  const menu=this.page.getByRole('menu',{name:'Palette',exact:true});
  const options = await menu.getByRole('menuitemradio').evaluateAll(elements => elements.map(element => element.dataset.value));
  await this.page.keyboard.press('Escape');
  assert.deepEqual(options.sort(), names.sort());
  assert.equal(new Set(options).size, options.length);
});
