// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { selectPage, selectDropdown } from "./navigation.helpers.mjs";

const editor = page => page.locator(".cm-editor");
const input = page => page.getByLabel("Code editor document", { exact: true });
const rectangles = page => editor(page).locator(".cm-joinedSelectionLayer .cm-selectionBackground");

async function selectionGeometry(page) {
  return rectangles(page).evaluateAll(elements => elements.map(element => {
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
      corners: [style.borderTopLeftRadius, style.borderTopRightRadius,
        style.borderBottomRightRadius, style.borderBottomLeftRadius],
    };
  }).sort((a, b) => a.top - b.top || a.left - b.left));
}

function assertThreeJoinedFragments(fragments, corners) {
  assert.equal(fragments.length, 3, "The selection has first, middle, and final fragments");
  const [first, middle, last] = fragments;
  assert.ok(Math.abs(first.bottom - middle.top) <= 0.5, "The first two fragments touch");
  assert.ok(Math.abs(middle.bottom - last.top) <= 0.5, "The last two fragments touch");
  assert.ok(Math.abs(first.right - middle.right) <= 0.5, "The upper right edge is aligned");
  assert.ok(Math.abs(middle.left - last.left) <= 0.5, "The lower left edge is aligned");
  assert.ok(middle.right - last.right > 4, "The final fragment ends before the full-width edge");
  assert.deepEqual(fragments.map(fragment => fragment.corners), corners);
}

async function prepareSelection(world) {
  await expect(input(world.page).locator(".cm-line").first().locator("span").first()).toHaveText("const");
  await input(world.page).focus();
  await world.page.keyboard.press("Control+Home");
  world.selectionAppearance = await editor(world.page).evaluate(root => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "color-mix(in srgb, var(--color-foreground) 20%, transparent)";
    root.append(probe);
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { surface, active: getComputedStyle(root.querySelector(".cm-activeLine")).backgroundColor,
      background: getComputedStyle(root).backgroundColor,
      keyword: getComputedStyle(root.querySelector(".cm-line span")).color };
  });
  assert.notEqual(world.selectionAppearance.surface, world.selectionAppearance.background,
    "The selection surface must differ from the editor background");
}

When("I select the first code keyword with the keyboard", async function () {
  await prepareSelection(this);
  await this.page.keyboard.press("Control+Shift+ArrowRight");
});

When("I extend the code selection to the document end", async function () {
  await this.page.keyboard.press("Control+Shift+End");
});

When("I select from inside the first code line to inside the last code line", async function () {
  await prepareSelection(this);
  await this.page.keyboard.press("ArrowRight");
  await this.page.keyboard.press("ArrowRight");
  await this.page.keyboard.press("Control+Shift+End");
  await this.page.keyboard.press("Shift+Home");
  for (let index = 0; index < 5; index += 1) await this.page.keyboard.press("Shift+ArrowRight");
  assert.equal(await this.page.evaluate(() => getSelection()?.toString()),
    'nst first = "hello";\nconst second = 42;\nconst');
});

When("I select the first two code keywords with multiple cursors", async function () {
  await prepareSelection(this);
  await this.page.keyboard.press("Control+Alt+ArrowDown");
  await this.page.keyboard.press("Control+Shift+ArrowRight");
});

Then("the selection uses one contrasting fill across {int} code line(s)", async function (count) {
  await expect(editor(this.page)).toHaveClass(/\bcm-has-selection\b/);
  await expect.poll(() => rectangles(this.page).evaluateAll(elements => {
    const lines = [...document.querySelectorAll(".cm-editor .cm-content .cm-line")];
    return lines.filter(line => {
      const bounds = line.getBoundingClientRect();
      const middle = bounds.top + bounds.height / 2;
      return elements.some(element => {
        const selection = element.getBoundingClientRect();
        return selection.top <= middle && selection.bottom >= middle && selection.width > 0;
      });
    }).length;
  })).toBe(count);
  const appearance = await rectangles(this.page).evaluateAll(elements => ({
    fills: elements.map(element => getComputedStyle(element).backgroundColor),
    outlines: elements.map(element => getComputedStyle(element).outlineStyle),
    active: [...document.querySelectorAll(".cm-editor .cm-content .cm-activeLine")]
      .map(element => getComputedStyle(element).backgroundColor),
  }));
  assert.ok(appearance.fills.length > 0);
  assert.ok(appearance.fills.every(color => color === this.selectionAppearance.surface),
    "Every selection rectangle has the same primary foreground fill at 20% opacity");
  assert.ok(appearance.outlines.every(style => style === "none"), "Selections use fill without outlined fragments");
  assert.ok(appearance.active.length > 0);
  assert.ok(appearance.active.every(color => color === this.selectionAppearance.active),
    "Selecting text keeps the existing active-line highlight");
});

Then("selected code keeps its syntax colors", async function () {
  const colors = await input(this.page).locator(".cm-line span").first().evaluate(token => ({
    ordinary: getComputedStyle(token).color,
    selected: getComputedStyle(token, "::selection").color,
    nativeBackground: getComputedStyle(token, "::selection").backgroundColor,
  }));
  assert.equal(colors.ordinary, this.selectionAppearance.keyword);
  assert.equal(colors.selected, colors.ordinary, "Native selection must preserve the syntax token color");
  assert.equal(colors.nativeBackground, "rgba(0, 0, 0, 0)",
    "CodeMirror draws both primary and secondary selection backgrounds");
});

Then("all {int} isolated selection fragments keep their rounded corners", async function (count) {
  await expect(rectangles(this.page)).toHaveCount(count);
  await expect.poll(async () => (await selectionGeometry(this.page)).map(fragment => fragment.corners))
    .toEqual(Array.from({ length: count }, () => ["4px", "4px", "4px", "4px"]));
});

Then("the partial multiline selection stays bounded to the selected text on each row", async function () {
  await expect(rectangles(this.page)).toHaveCount(3);
  const fragments = await selectionGeometry(this.page);
  const text = await input(this.page).locator(".cm-line").evaluateAll(lines => lines.map(line => {
    const range = document.createRange();
    range.selectNodeContents(line);
    const bounds = range.getBoundingClientRect();
    return { left: bounds.left, right: bounds.right, keywordRight: line.querySelector("span").getBoundingClientRect().right };
  }));
  assert.ok(fragments[0].left - fragments[1].left > 4,
    "The selection starts inside the first line");
  for (let index = 0; index < fragments.length; index++) {
    const fragment = fragments[index];
    const end = index === 2 ? text[index].keywordRight : text[index].right;
    assert.ok(Math.abs(fragment.right - end) <= .5, "Selection fills stop at selected text, without extending into empty space");
    if (index > 0) {
      assert.ok(Math.abs(fragment.left - text[index].left) <= .5, "Following rows start with their selected text");
      assert.ok(fragment.top >= fragments[index - 1].bottom, "Selection rows do not overlap");
    }
    assert.deepEqual(fragment.corners, ["4px", "4px", "4px", "4px"], "Each separate row retains rounded corners");
  }
});

Then("the multiline selection appearance is captured", async function () {
  await mkdir(this.artifactDirectory, { recursive: true });
  const screenshot = await this.page.screenshot({ path: join(this.artifactDirectory, "multiline-selection.png") });
  await this.attach(screenshot, "image/png");
});

When("I collapse the code selection with the keyboard", async function () {
  await this.page.keyboard.press("ArrowRight");
});

Then("the active code line background is preserved after collapsing the selection", async function () {
  await expect(editor(this.page)).not.toHaveClass(/\bcm-has-selection\b/);
  await expect(rectangles(this.page)).toHaveCount(0);
  const active = await input(this.page).locator(".cm-activeLine").evaluateAll(elements =>
    elements.map(element => getComputedStyle(element).backgroundColor));
  assert.ok(active.length > 0);
  assert.ok(active.every(color => color === this.selectionAppearance.active));
});

async function codeGeometry(page) {
  return input(page).evaluate(content => {
    const bounds = rect => [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 100) / 100);
    return [...content.querySelectorAll(".cm-line")].map(line => {
      const characters = [];
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        for (let index = 0; index < text.length; index += 1) {
          const range = document.createRange();
          range.setStart(text, index);
          range.setEnd(text, index + 1);
          characters.push(bounds(range.getBoundingClientRect()));
        }
      }
      return { text: line.textContent, line: bounds(line.getBoundingClientRect()), characters };
    });
  });
}

When("the editor displays a repeated wrapped token", async function () {
  this.wrappedMatchToken = "repeatedIdentifierThatContinuesAcrossSeveralVisualLinesWithoutChangingTheOriginalTextGeometry".repeat(2);
  await this.page.setViewportSize({ width: 500, height: 900 });
  await selectPage(this.page, "Settings");
  await selectDropdown(this.page, "Settings scope", "global");
  await this.page.getByRole("switch", { name: "Line wrapping", exact: true }).check();
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
  await selectPage(this.page, "Editor");
  await input(this.page).focus();
  await this.page.keyboard.press("Control+a");
  await this.page.keyboard.insertText(`${this.wrappedMatchToken}\n${this.wrappedMatchToken}\nuntouched`);
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
  await this.page.evaluate(() => document.fonts.ready);
  await this.page.keyboard.press("Control+Home");
  this.matchCodeGeometry = await codeGeometry(this.page);
});

When("I select the first wrapped token with the keyboard", async function () {
  await this.page.keyboard.press("Control+Shift+ArrowRight");
  assert.equal(await this.page.evaluate(() => getSelection()?.toString()), this.wrappedMatchToken);
});

Then("the wrapped selection has square joins and rounded exposed corners", async function () {
  await expect(rectangles(this.page)).toHaveCount(3);
  const fragments = await selectionGeometry(this.page);
  assert.ok(Math.abs(fragments[0].left - fragments[1].left) <= 0.5,
    "Wrapping keeps the upper left edge aligned");
  assertThreeJoinedFragments(fragments, [
    ["4px", "4px", "0px", "0px"],
    ["0px", "0px", "4px", "0px"],
    ["0px", "0px", "4px", "4px"],
  ]);
});

Then("every matching token fragment has a separate outline without moving the code", async function () {
  await expect(input(this.page).locator(".cm-selectionMatch")).toHaveText(this.wrappedMatchToken);
  const geometry = () => editor(this.page).evaluate(root => {
    const bounds = rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    const probe = document.createElement("span");
    probe.style.cssText = "position: absolute; color: var(--palette-8)";
    root.append(probe);
    const paletteColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      paletteColor,
      fragments: [...root.querySelectorAll(".cm-selectionMatch")].flatMap(match =>
        [...match.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(bounds)),
      outlines: [...root.querySelectorAll(".cm-selectionMatchOutline")].map(outline => {
        const style = getComputedStyle(outline);
        return {
          ...bounds(outline.getBoundingClientRect()),
          outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle,
          outlineOffset: style.outlineOffset, outlineColor: style.outlineColor,
          borderRadius: style.borderRadius, pointerEvents: style.pointerEvents,
        };
      }),
    };
  });
  await expect.poll(async () => {
    const current = await geometry();
    return current.fragments.length > 1 && current.fragments.length === current.outlines.length;
  }).toBe(true);
  const current = await geometry();
  for (const [index, fragment] of current.fragments.entries()) {
    const outline = current.outlines[index];
    assert.ok(Math.abs(outline.x - fragment.x) <= 0.5);
    assert.ok(Math.abs(outline.y - fragment.y) <= 0.5);
    assert.ok(Math.abs(outline.width - fragment.width) <= 0.5);
    assert.ok(Math.abs(outline.height - fragment.height) <= 0.5);
    assert.equal(outline.outlineWidth, "1px");
    assert.equal(outline.outlineStyle, "solid");
    assert.equal(outline.outlineOffset, "0px");
    assert.equal(outline.outlineColor, current.paletteColor);
    assert.equal(outline.borderRadius, "4px");
    assert.equal(outline.pointerEvents, "none");
  }
  await expect(input(this.page).locator(".cm-selectionMatch")).toHaveCSS("outline-style", "none");
  await expect(input(this.page).locator(".cm-selectionMatch")).toHaveCSS("border-top-width", "0px");
  assert.deepEqual(await codeGeometry(this.page), this.matchCodeGeometry,
    "Matching outlines must not shift lines or individual characters");
});

Then("the matching-token outline appearance is captured", async function () {
  await mkdir(this.artifactDirectory, { recursive: true });
  const screenshot = await this.page.screenshot({ path: join(this.artifactDirectory, "matching-token-outlines.png") });
  await this.attach(screenshot, "image/png");
});

Then("matching-token outlines are cleared", async function () {
  await expect(input(this.page).locator(".cm-selectionMatch")).toHaveCount(0);
  await expect(editor(this.page).locator(".cm-selectionMatchOutline")).toHaveCount(0);
  assert.deepEqual(await codeGeometry(this.page), this.matchCodeGeometry);
});

When("the editor displays a multiline function", async function () {
  await input(this.page).focus();
  await this.page.keyboard.press("Control+a");
  await this.page.keyboard.insertText("function sample() {\n  return 1;\n}");
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
  await this.page.evaluate(() => document.fonts.ready);
  await this.page.keyboard.press("Control+Home");
  this.braceCodeGeometry = await codeGeometry(this.page);
});

When("I move the caret beside the opening function brace", async function () {
  await this.page.keyboard.press("Control+Home");
  await this.page.keyboard.press("End");
});

When("I move the caret beside the closing function brace", async function () {
  await this.page.keyboard.press("Control+End");
});

Then("both matching braces have the token outline style without moving the code", async function () {
  await expect(input(this.page).locator(".cm-matchingBracket")).toHaveText(["{", "}"]);
  await expect(editor(this.page).locator(".cm-selectionMatchOutline")).toHaveCount(2);
  const appearance = await editor(this.page).evaluate(root => {
    const bounds = element => {
      const rect = element.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    };
    const probe = document.createElement("span");
    probe.style.cssText = "position: absolute; color: var(--palette-8); background: var(--color-surface)";
    root.append(probe);
    const paletteColor = getComputedStyle(probe).color;
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      paletteColor, surface,
      braces: [...root.querySelectorAll(".cm-matchingBracket")].map(brace => {
        const style = getComputedStyle(brace);
        return { bounds: bounds(brace), fill: style.backgroundColor,
          outline: style.outlineStyle, border: style.borderTopWidth, radius: style.borderRadius };
      }),
      outlines: [...root.querySelectorAll(".cm-selectionMatchOutline")].map(outline => {
        const style = getComputedStyle(outline);
        return { bounds: bounds(outline), style: [style.outlineWidth, style.outlineStyle,
          style.outlineOffset, style.outlineColor, style.borderRadius, style.pointerEvents] };
      }),
    };
  });
  for (const [index, brace] of appearance.braces.entries()) {
    const outline = appearance.outlines[index];
    assert.ok(brace.bounds.every((value, axis) => Math.abs(value - outline.bounds[axis]) <= 0.5),
      `The outline follows its bracket glyph exactly: ${JSON.stringify({ brace: brace.bounds, outline: outline.bounds })}`);
    assert.deepEqual(outline.style, ["1px", "solid", "0px", appearance.paletteColor, "4px", "none"]);
    assert.equal(brace.fill, appearance.surface);
    assert.equal(brace.outline, "none");
    assert.equal(brace.border, "0px");
    assert.equal(brace.radius, "4px");
  }
  assert.deepEqual(await codeGeometry(this.page), this.braceCodeGeometry,
    "Matching brace highlights must not shift lines or individual characters");
});

When("I move the caret away from the function braces", async function () {
  await this.page.keyboard.press("Control+Home");
});

Then("matching brace highlights and outlines are cleared", async function () {
  await expect(input(this.page).locator(".cm-matchingBracket")).toHaveCount(0);
  await expect(editor(this.page).locator(".cm-selectionMatchOutline")).toHaveCount(0);
  assert.deepEqual(await codeGeometry(this.page), this.braceCodeGeometry);
});

Then("Alt Shift Left stays on line twenty beneath an if condition",async function(){
  const document=input(this.page);
  const source=[...Array.from({length:18},()=>"// context"),"if (ready) {","  run();","}"].join("\n");
  await document.click();await this.page.keyboard.press("Control+a");await this.page.keyboard.insertText(source);
  await expect(this.page.getByRole("status",{name:"Persistence status",exact:true})).toHaveText("All changes saved");
  await this.page.keyboard.press("Escape");await this.page.keyboard.press("Control+Home");
  for(let line=1;line<20;line++)await this.page.keyboard.press("ArrowDown");
  await this.page.keyboard.press("End");for(let column=0;column<6;column++)await this.page.keyboard.press("ArrowLeft");
  await this.page.keyboard.press("Alt+Shift+ArrowLeft");
  assert.equal(await this.page.evaluate(()=>getSelection()?.toString()),"  ");
  await this.page.keyboard.press("Alt+Shift+ArrowLeft");
  assert.equal(await this.page.evaluate(()=>getSelection()?.toString()),"  ");
  await this.page.keyboard.insertText("    ");
  await expect(document).toHaveText(source.replace("  run();","    run();").replaceAll("\n",""));
});

Then('the selected matching token has only a matching bottom border',async function(){
  const marks=editor(this.page).locator('.cm-selectionSourceUnderline');
  await expect(marks).toHaveCount(3);
  const reference=await editor(this.page).locator('.cm-selectionMatchOutline').first().evaluate(element=>getComputedStyle(element).outlineColor);
  for(const mark of await marks.all()){
    const style=await mark.evaluate(element=>{const css=getComputedStyle(element);return {shadow:css.boxShadow,bottom:css.borderBottomWidth,top:css.borderTopWidth,left:css.borderLeftWidth,right:css.borderRightWidth};});
    const {shadow,...borders}=style;
    assert.deepEqual(borders,{bottom:'0px',top:'0px',left:'0px',right:'0px'});
    assert.ok(shadow.startsWith(`${reference} 0px 1px 0px 0px, `));
    assert.ok(shadow.endsWith('0px 2px 0px 0px'));
  }
});
When('I select the unique final word',async function(){
  await input(this.page).focus();await this.page.keyboard.press('Control+End');await this.page.keyboard.press('Control+Shift+ArrowLeft');
});
Then('the selected text has no matching bottom border',async function(){
  await expect(input(this.page).locator('.cm-selectionMatch')).toHaveCount(0);
  await expect(editor(this.page).locator('.cm-selectionSourceUnderline')).toHaveCount(0);
});
