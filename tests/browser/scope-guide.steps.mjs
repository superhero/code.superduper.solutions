// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { selectPage, selectDropdown } from "./navigation.helpers.mjs";

const editor = page => page.locator(".cm-editor");
const input = page => page.getByLabel("Code editor document", { exact: true });
const scroller = page => editor(page).locator(":scope > .cm-scroller");
const guides = page => editor(page).locator(".cm-bracketScopeGuide");
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");
const nestedFunctions = [
  "function outer() {",
  "  function inner() {",
  "    return 1;",
  "  }",
  "  return inner();",
  "}",
];

async function codeGeometry(page) {
  return input(page).evaluate(content => {
    const bounds = rect => [rect.x, rect.y, rect.width, rect.height]
      .map(value => Math.round(value * 100) / 100);
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

async function guideGeometry(page, openingText, closingText, bodyText) {
  return editor(page).evaluate((root, texts) => {
    const bounds = rect => ({ left: rect.left, right: rect.right, top: rect.top,
      bottom: rect.bottom, width: rect.width, height: rect.height });
    const lines = [...root.querySelectorAll(".cm-content .cm-line")];
    const findLine = text => lines.find(line => line.textContent === text);
    const firstCharacter = line => {
      if (!line) return null;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        const index = text.textContent.search(/\S/);
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        return bounds(range.getBoundingClientRect());
      }
      return null;
    };
    const opening = findLine(texts.openingText);
    const closing = findLine(texts.closingText);
    const body = findLine(texts.bodyText);
    const viewport = root.querySelector(":scope > .cm-scroller").getBoundingClientRect();
    const probe = document.createElement("span");
    probe.style.cssText = "position: absolute; color: var(--palette-8)";
    root.append(probe);
    const paletteColor = getComputedStyle(probe).color;
    probe.remove();
    return {
      viewport: bounds(viewport), paletteColor,
      opening: opening ? bounds(opening.getBoundingClientRect()) : null,
      closingLine: closing ? bounds(closing.getBoundingClientRect()) : null,
      closing: firstCharacter(closing), body: firstCharacter(body),
      guides: [...root.querySelectorAll(".cm-bracketScopeGuide")].map(guide => {
        const style = getComputedStyle(guide);
        return { ...bounds(guide.getBoundingClientRect()), color: style.color,
          backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
          backgroundSize: style.backgroundSize, backgroundRepeat: style.backgroundRepeat,
          pointerEvents: style.pointerEvents };
      }),
    };
  }, { openingText, closingText, bodyText });
}

function assertGuideAppearance(geometry) {
  assert.equal(geometry.guides.length, 1, "Only the active matching scope has a guide");
  const guide = geometry.guides[0];
  assert.equal(guide.width, 1, "The guide is one CSS pixel wide");
  assert.equal(guide.color, geometry.paletteColor, "The guide uses palette 8");
  assert.equal(guide.backgroundColor, "rgba(0, 0, 0, 0)", "The space between dots stays transparent");
  assert.equal(guide.backgroundImage,
    `radial-gradient(circle at 0.5px 0.5px, ${geometry.paletteColor} 0.5px, rgba(0, 0, 0, 0) 0.5px)`,
    "The guide uses round dots with a half-pixel radius");
  assert.equal(guide.backgroundSize, "1px 5px", "One-pixel dots leave four pixels of vertical space");
  assert.equal(guide.backgroundRepeat, "repeat-y", "The dots repeat vertically");
  assert.equal(guide.pointerEvents, "none", "The guide leaves code input unobstructed");
  return guide;
}

function close(actual, expected, description) {
  assert.ok(Math.abs(actual - expected) <= 0.75,
    `${description}: expected ${expected}, received ${actual}`);
}

async function insertScopeSource(world, source) {
  await input(world.page).focus();
  await world.page.keyboard.insertText(source);
  await saved(world.page);
  await world.page.evaluate(() => document.fonts.ready);
  await world.page.keyboard.press("Control+Home");
}

Given("the editor contains nested functions for scope guide checks", async function () {
  await insertScopeSource(this, nestedFunctions.join("\n"));
  await expect(input(this.page).locator(".cm-line")).toHaveText(nestedFunctions);
  this.scopeCodeGeometry = await codeGeometry(this.page);
});

When("I place the scope-guide caret after the {word} {word} brace", async function (scope, endpoint) {
  const line = { inner: { opening: 2, closing: 4 }, outer: { opening: 1, closing: 6 } }[scope]?.[endpoint];
  assert.ok(line, `Unknown scope endpoint: ${scope} ${endpoint}`);
  await input(this.page).focus();
  await this.page.keyboard.press("Control+Home");
  for (let index = 1; index < line; index += 1) await this.page.keyboard.press("ArrowDown");
  await this.page.keyboard.press("End");
});

Then("the scope guide joins the {word} braces without moving the code", async function (scope) {
  const [opening, closing, body] = scope === "inner" ? [1, 3, 2] : [0, 5, 1];
  await expect(guides(this.page)).toHaveCount(1);
  await expect.poll(async () => {
    const current = await guideGeometry(this.page,
      nestedFunctions[opening], nestedFunctions[closing], nestedFunctions[body]);
    const guide = current.guides[0];
    return Math.abs(guide.top - (current.opening.bottom + 7)) <= 0.75 &&
      Math.abs(guide.left - (current.closing.left + 3)) <= 0.75 &&
      Math.abs(guide.bottom - (current.closingLine.top - 7)) <= 0.75;
  }).toBe(true);
  const geometry = await guideGeometry(this.page,
    nestedFunctions[opening], nestedFunctions[closing], nestedFunctions[body]);
  const guide = assertGuideAppearance(geometry);
  close(guide.left, geometry.closing.left + 3, "The guide sits three pixels to the right of the scope indentation");
  assert.ok(guide.right < geometry.body.left, "The guide stays to the left of the scope body");
  close(guide.top, geometry.opening.bottom + 7, "The guide begins seven pixels below the opening line");
  close(guide.bottom, geometry.closingLine.top - 7,
    "The guide ends seven pixels above the closing line");
  assert.deepEqual(await codeGeometry(this.page), this.scopeCodeGeometry,
    "The scope guide must not move lines or individual characters");
});

When("I move the scope-guide caret away from brackets", async function () {
  await this.page.keyboard.press("Control+Home");
});

When("I place the scope-guide caret beside single-line parentheses", async function () {
  await this.page.keyboard.press("Control+Home");
  await this.page.keyboard.press("End");
  await this.page.keyboard.press("ArrowLeft");
  await this.page.keyboard.press("ArrowLeft");
  await expect(input(this.page).locator(".cm-matchingBracket")).toHaveText(["(", ")"]);
});

Then("no active bracket scope guide is drawn", async function () {
  await expect(guides(this.page)).toHaveCount(0);
});

When("I turn bracket matching {word} for scope guide checks", async function (state) {
  await selectPage(this.page, "Settings");
  await selectDropdown(this.page, "Settings scope", "global");
  await this.page.getByRole("switch", { name: "Bracket matching", exact: true }).setChecked(state === "on");
  await saved(this.page);
  await selectPage(this.page, "Editor");
});

When("I collapse the outer function for scope guide checks", async function () {
  await scroller(this.page).locator('[title="Fold line"]').first().click();
  await expect(scroller(this.page).locator(".cm-foldPlaceholder")).toHaveCount(1);
});

Given("the editor contains a scope with {int} body lines", async function (count) {
  this.longScopeOpening = "function longScope() {";
  this.longScopeBody = Array.from({ length: count }, (_, index) => `  const item${index} = ${index};`);
  this.longScopeCursor = `Ln ${count + 2}, Col 2`;
  await insertScopeSource(this, [this.longScopeOpening, ...this.longScopeBody, "}"].join("\n"));
});

When("I place the scope-guide caret after the long scope closing brace", async function () {
  await this.page.keyboard.press("Control+End");
  await expect(this.page.locator(".editor-status")).toContainText(this.longScopeCursor);
});

Then("the scope guide reaches the closing brace with its opening brace offscreen", async function () {
  await expect(guides(this.page)).toHaveCount(1);
  const geometry = await guideGeometry(this.page, this.longScopeOpening, "}", this.longScopeBody.at(-1));
  const guide = assertGuideAppearance(geometry);
  assert.ok(!geometry.opening || geometry.opening.bottom <= geometry.viewport.top,
    "The opening bracket must be above the visible viewport");
  assert.ok(geometry.closing.top > geometry.viewport.top && geometry.closing.bottom <= geometry.viewport.bottom,
    "The closing bracket remains visible");
  close(guide.left, geometry.closing.left + 3, "The offscreen opening preserves the guide's indentation offset");
  assert.ok(guide.right < geometry.body.left, "The guide stays left of the visible body");
  assert.ok(guide.top <= geometry.viewport.top + 1, "The guide covers the top of the visible scope");
  close(guide.bottom, geometry.closingLine.top - 7,
    "The visible guide ends seven pixels above the closing line");
  this.longScopeGuideLeft = guide.left;
});

When("I scroll to the middle of the active long scope", async function () {
  await scroller(this.page).evaluate(element => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
  });
  await expect.poll(() => input(this.page).locator(".cm-line").allTextContents())
    .toContain(this.longScopeBody[Math.floor(this.longScopeBody.length / 2)]);
});

When("I scroll another {int} pixels within the active long scope", async function (distance) {
  const start = await scroller(this.page).evaluate(element => element.scrollTop);
  await scroller(this.page).evaluate((element, delta) => { element.scrollTop += delta; }, distance);
  await expect.poll(() => scroller(this.page).evaluate(element => element.scrollTop)).toBe(start + distance);
});

Then("the scope guide spans the viewport while the caret remains at the closing brace", async function () {
  await expect(guides(this.page)).toHaveCount(1);
  const geometry = await guideGeometry(this.page, this.longScopeOpening, "}",
    this.longScopeBody[Math.floor(this.longScopeBody.length / 2)]);
  const guide = assertGuideAppearance(geometry);
  assert.ok(!geometry.opening || geometry.opening.bottom <= geometry.viewport.top,
    "The opening bracket is outside the viewport");
  assert.ok(!geometry.closing || geometry.closing.top >= geometry.viewport.bottom,
    "The closing bracket is outside the viewport");
  close(guide.left, this.longScopeGuideLeft, "Scrolling preserves the scope indentation");
  assert.ok(guide.right < geometry.body.left, "The guide stays left of the visible body");
  assert.ok(guide.top <= geometry.viewport.top + 1, "The guide covers the visible scope's top edge");
  assert.ok(guide.bottom >= geometry.viewport.bottom - 1, "The guide covers the visible scope's bottom edge");
  await expect(this.page.locator(".editor-status")).toContainText(this.longScopeCursor);
});

Then("adjacent bracket pairs omit outlines and spaced pairs retain them", async function () {
  for (const pair of ["()", "[]", "{}", "( )", "[ ]", "{ }"]) {
    await input(this.page).click();await this.page.keyboard.press("Control+a");
    await this.page.keyboard.insertText(pair);await saved(this.page);
    for (const position of ["opening", "closing"]) {
      await this.page.keyboard.press("Control+Home");
      if(position==="closing")await this.page.keyboard.press("End");
      await expect(editor(this.page).locator(".cm-matchingBracket").first()).toBeVisible();
      const outlines=editor(this.page).locator(".cm-selectionMatchOutline");
      if(pair.length===2)await expect(outlines).toHaveCount(0);
      else {await expect(outlines).toHaveCount(2);await expect(outlines.first()).toHaveCSS("outline-width","1px");}
    }
  }
});
