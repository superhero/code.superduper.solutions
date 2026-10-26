// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { selectPage, selectDropdown } from "./navigation.helpers.mjs";

const editor = page => page.getByLabel("Code editor document", { exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");

function luminance(channels) {
  return channels.slice(0, 3).map(value => value / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

async function syntaxColors(page, tokens, target = page.locator(".cm-editor")) {
  return target.evaluate((root, samples) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const drawing = canvas.getContext("2d", { willReadFrequently: true });
    const color = value => {
      drawing.clearRect(0, 0, 1, 1);
      drawing.fillStyle = value;
      drawing.fillRect(0, 0, 1, 1);
      return [...drawing.getImageData(0, 0, 1, 1).data];
    };
    const probe = document.createElement("span");
    root.append(probe);
    try {
      const styles = getComputedStyle(root);
      const background = color(styles.backgroundColor);
      // Check the palette's opaque surfaces; a row's translucent fill alone is
      // not its composited background. Git change tints are separate treatments.
      const surface = color(styles.getPropertyValue("--color-surface").trim());
      let rendered = "";
      const fragments = [];
      for (const line of root.querySelectorAll(".cm-content .cm-line")) {
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        let text;
        while ((text = walker.nextNode())) {
          const from = rendered.length; rendered += text.textContent;
          fragments.push({ from, to: rendered.length, parent: text.parentElement });
        }
        rendered += "\n";
      }
      const rows = samples.map(({ token, role, occurrence = "1" }) => {
        const pill = role === "parent" || role === "global" || role === "imported";
        const variable = role === "local" ? "--color-foreground" : `--syntax-${pill && role !== "imported" ? `${role}Text` : role}`;
        if (!styles.getPropertyValue(variable).trim()) throw new Error(`Missing ${variable}`);
        probe.style.color = `var(${variable})`;
        const expected = color(getComputedStyle(probe).color);
        let remaining = Number(occurrence);
        for (let offset = rendered.indexOf(token); offset >= 0; offset = rendered.indexOf(token, offset + token.length)) {
          const before = rendered[offset - 1], after = rendered[offset + token.length];
          if ((before && /[\w$]/.test(before)) || (after && /[\w$]/.test(after))) continue;
          if (--remaining !== 0) continue;
          const fragment = fragments.find(part => part.from <= offset && part.to > offset);
          return { token, role, expected, actual: color(getComputedStyle(fragment.parent).color),
            ...(pill ? { background: color(getComputedStyle(fragment.parent.closest(`.cm-scope-${role}`), "::before").backgroundColor) } : {}) };
        }
        throw new Error(`Syntax token was not rendered: ${token}`);
      });
      const scopes = Object.fromEntries(["global", "parent"].map(role => {
        probe.style.color = `var(--syntax-${role})`;
        return [role, color(getComputedStyle(probe).color)];
      }));
      const mixSources = Object.fromEntries(["function", "string", "foreground", "secondaryForeground"].map(role => {
        probe.style.color = role === "secondaryForeground" ? "var(--tone-5)" : `var(--${role === "foreground" ? "color" : "syntax"}-${role})`;
        return [role, color(getComputedStyle(probe).color)];
      }));
      probe.style.color = "var(--palette-13)";
      return { backgrounds: [background, surface], rows, scopes, mixSources,
        operator: color(getComputedStyle(probe).color),
        palette: document.documentElement.dataset.palette, mode: document.documentElement.dataset.theme };
    } finally { probe.remove(); }
  }, tokens);
}

async function assertSyntaxColors(world, context = "", target) {
  const result = await syntaxColors(world.page, world.syntaxTokens, target);
  const categories = new Map();
  for (const { token, role, actual, expected, background: tokenBackground } of result.rows) {
    assert.deepEqual(actual, expected, `${context}${token} must use the ${role} syntax color`);
    assert.equal(actual[3], 255, `${context}${token} must be opaque`);
    if (role === "operator") assert.deepEqual(actual, result.operator,
      `${context}${token} must use the exact thirteenth palette color`);
    if (role === "parent" || role === "global") assert.deepEqual(tokenBackground,
      role === "global" ? result.mixSources.secondaryForeground : result.mixSources.foreground,
      `${context}${token} must use its foreground palette color as its pill fill`);
    if (role === "imported") tokenBackground.forEach((channel,index)=>{
      const mixed=(result.mixSources.foreground[index]+result.mixSources.secondaryForeground[index])/2;
      assert.ok(Math.abs(channel-mixed)<=1,`${context}${token} must mix the foreground colors equally`);
    });
    const category = role === "type" ? "function" : role === "parent" || role === "global" || role === "imported" ? "scopePill" : role;
    if (categories.has(category)) assert.deepEqual(actual, categories.get(category), "Shared default color mappings agree");
    categories.set(category, actual);
    for (const background of tokenBackground ? [tokenBackground] : result.backgrounds) {
      assert.equal(background[3], 255, "Editor backgrounds must be opaque");
      // Bonfire keeps the explicitly requested violet in both color modes.
      if (role === "operator" && result.palette === "bonfire") continue;
      const a = luminance(actual), b = luminance(background);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(ratio >= 4.5, `${context}${token} contrast is ${ratio.toFixed(3)}:1 (${JSON.stringify({actual,background})})`);
    }
  }
  assert.equal(new Set([...categories.values()].map(color => color.join(","))).size, categories.size,
    `${context}Independent syntax color categories stay distinct`);
  return result;
}

When("I insert this syntax sample into the code document:", async function (source) {
  await editor(this.page).click();
  await this.page.keyboard.insertText(source);
  await saved(this.page);
  await expect.poll(() => editor(this.page).locator(".cm-line").allTextContents().then(lines => lines.join("\n")))
    .toBe(source);
});

When("I replace the syntax sample with:", async function (source) {
  await editor(this.page).click();
  await this.page.keyboard.press("ControlOrMeta+a");
  await this.page.keyboard.insertText(source);
  await saved(this.page);
});

When("I set JavaScript syntax highlighting to {string}", async function (value) {
  await selectPage(this.page, "Settings", "Languages");
  await selectDropdown(this.page, "Settings scope", "global");
  await this.page.getByLabel("Filter syntax highlighting", { exact: true }).fill("JavaScript");
  await selectDropdown(this.page, "JavaScript syntax highlighting", value);
  await saved(this.page);
  if (value === "disabled") await expect(this.page.locator(".cm-scope-global, .cm-scope-parent, .cm-scope-imported, .cm-syntax-operator, .cm-syntax-dot, .cm-syntax-semicolon, .cm-function-parameter")).toHaveCount(0);
  await selectPage(this.page, "Editor");
});

Then("no scope colors remain in the document", async function () {
  await expect(this.page.locator(".cm-scope-global, .cm-scope-parent, .cm-scope-imported, .cm-syntax-operator, .cm-syntax-dot, .cm-syntax-semicolon, .cm-function-parameter")).toHaveCount(0);
});

Then("both diff panes retain the reference scope colors", async function () {
  const diff = this.page.getByRole("region", { name: "File diff", exact: true });
  await expect(diff).toBeVisible();
  for (const side of ["a", "b"]) await assertSyntaxColors(this, `diff ${side}: `, diff.locator(`.cm-editor.cm-merge-${side}`));
});

Then("the palette includes thirteen swatches with a separate operator color", async function () {
  const expected = this.initialSyntaxColors.mixSources.function;
  const operator = (await syntaxColors(this.page, [{ token: "+", role: "operator" }])).rows[0];
  assert.deepEqual(operator.actual, operator.expected);
  await selectPage(this.page, "Settings", "Languages");
  await selectDropdown(this.page, "Settings scope", "global");
  const preview = this.page.locator(".palette-preview");
  await expect(preview.locator("span")).toHaveCount(13);
  const actual = await preview.evaluate(element => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    return [9, 12].map(index => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = getComputedStyle(element.children[index]).backgroundColor;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    });
  });
  assert.deepEqual(actual[0], expected, "Functions retain their existing palette swatch");
  assert.deepEqual(actual[1], operator.actual, "Operators use the new visible palette swatch");
});

When("I prepare a long document with global parent and imported names", async function () {
  await editor(this.page).click();
  await this.page.keyboard.insertText('import helper from "source";\nconst outer = 1;\n' + Array.from({ length: 180 }, (_, index) =>
    `function render${index}(input) { return helper(Math.max(input, outer)) + 1; }`).join('\n'));
  await saved(this.page);
  await this.page.keyboard.press("ControlOrMeta+Home");
});

Then("the minimap paints all three scope colors and the operator color", async function () {
  const root = this.page.locator(".cm-editor");
  await expect(root.locator(".cm-scope-global").first()).toHaveText("Math");
  await expect(root.locator(".cm-scope-parent").first()).toHaveText("outer");
  await expect(root.locator(".cm-scope-imported").first()).toHaveText("helper");
  await expect(root.locator(".cm-minimap-inner canvas")).toBeVisible();
  await expect.poll(() => root.evaluate(element => {
    const canvas = element.querySelector(".cm-minimap-inner canvas");
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) if (pixels[index + 3] === 255) colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const drawing = probe.getContext("2d", { willReadFrequently: true });
    const scopes = [".cm-scope-global", ".cm-scope-parent", ".cm-scope-imported"].every(selector => {
      const node = element.querySelector(selector);
      if (!node) return false;
      drawing.fillStyle = getComputedStyle(node).color;
      drawing.fillRect(0, 0, 1, 1);
      return colors.has([...drawing.getImageData(0, 0, 1, 1).data].slice(0, 3).join(","));
    });
    const sample = document.createElement("span");
    sample.style.color = "var(--syntax-operator)";
    element.append(sample);
    drawing.fillStyle = getComputedStyle(sample).color;
    drawing.fillRect(0, 0, 1, 1);
    sample.remove();
    return scopes && colors.has([...drawing.getImageData(0, 0, 1, 1).data].slice(0, 3).join(","));
  })).toBe(true);
});

When("I set the editor color mode to {string}", async function (mode) {
  await saved(this.page);
  await selectPage(this.page, "Settings", "Languages");
  await selectDropdown(this.page, "Settings scope", "global");
  await selectDropdown(this.page, "Color mode", mode);
  await saved(this.page);
  await selectPage(this.page, "Editor");
  await expect(this.page.locator("html")).toHaveAttribute("data-theme", mode);
});

Then("these syntax tokens have distinct readable colors:", async function (table) {
  this.syntaxTokens = table.hashes();
  this.initialSyntaxColors = await assertSyntaxColors(this);
  this.syntaxEditorElement = await this.page.locator(".cm-editor").elementHandle();
});

Then("the syntax colors update without reopening the document", async function () {
  assert.equal(await this.syntaxEditorElement.evaluate(element => element === document.querySelector(".cm-editor")), true,
    "Changing color mode must preserve the existing editor");
  const current = await syntaxColors(this.page, this.syntaxTokens);
  assert.notDeepEqual(current.rows.map(row => row.actual), this.initialSyntaxColors.rows.map(row => row.actual),
    "The existing document must receive the new mode's syntax colors");
});

Then("the syntax tokens keep distinct readable colors", async function () {
  await assertSyntaxColors(this);
});

Then("these syntax tokens follow the palette in every color mode:", async function (table) {
  this.syntaxTokens = table.hashes();
  await selectPage(this.page, "Settings", "Appearance");
  await selectDropdown(this.page, "Settings scope", "global");
  await this.page.getByRole("button", { name: "Palette", exact: true }).click();
  const paletteMenu = this.page.getByRole("menu", { name: "Palette", exact: true });
  const palettes = await paletteMenu.getByRole("menuitemradio")
    .evaluateAll(options => options.map(option => option.dataset.value));
  await this.page.keyboard.press("Escape");
  await expect(paletteMenu).toBeHidden();
  assert.ok(palettes.length > 1, "Read the complete shipped palette selector");
  await selectPage(this.page, "Editor");
  const scopeColors = [];
  for (const palette of palettes) {
    for (const mode of ["light", "dark"]) {
      await this.page.evaluate(({ palette, mode }) => {
        document.documentElement.dataset.palette = palette;
        document.documentElement.dataset.theme = mode;
        document.documentElement.classList.toggle("dark", mode === "dark");
      }, { palette, mode });
      const colors = await assertSyntaxColors(this, `${palette}/${mode}: `);
      const scopes = colors.rows.filter(row => ["global", "parent", "imported"].includes(row.role));
      if (scopes.length) scopeColors.push({ palette, mode, scopes });
    }
  }
  if (scopeColors.length) await this.attach(JSON.stringify(scopeColors), "application/json");
});
Then('Bonfire keywords retain their orange hue and follow stylesheet changes live',async function(){
  const page=this.page;
  await page.evaluate(()=>{document.documentElement.dataset.palette='bonfire';document.documentElement.dataset.theme='dark';});
  const keyword=editor(page).getByText('const',{exact:true});
  const rgb=()=>keyword.evaluate(e=>getComputedStyle(e).color.match(/[\d.]+/g).slice(0,3).map(Number));
  await expect.poll(async()=>{const [r,g,b]=await rgb();return r>g*1.3&&g>b*1.5;}).toBe(true);
  const original=await rgb();const view=await page.locator('.cm-editor').elementHandle();
  await page.evaluate(()=>{const style=document.createElement('style');style.id='live-palette-test';style.textContent=':root[data-palette="bonfire"] { --palette-dark-7: #2d3690; }';document.head.append(style);});
  await expect.poll(async()=>{const [r,g,b]=await rgb();return b>r*1.3&&b>g*1.3;}).toBe(true);
  expect(await view.evaluate(e=>e===document.querySelector('.cm-editor'))).toBe(true);
  await page.evaluate(()=>document.getElementById('live-palette-test').remove());
  await expect.poll(rgb).toEqual(original);
});
