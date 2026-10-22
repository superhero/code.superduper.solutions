// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const treeItem = (page, path) => page.getByRole("tree", { name: "Repository files", exact: true })
  .getByRole("treeitem", { name: path, exact: true });
const row = (page, path) => treeItem(page, path).locator(":scope > .tree-row");
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved", { timeout: 20_000 });

Given("native repository dragging is observed", async function () {
  await this.page.evaluate(() => {
    globalThis.__repositoryDragEvents = [];
    for (const type of ["dragstart", "dragend"]) document.addEventListener(type, event => {
      if (event.isTrusted) globalThis.__repositoryDragEvents.push({ type,
        path: event.target.closest("[data-file-path]")?.getAttribute("data-file-path"),
        effect: event.dataTransfer?.dropEffect });
    }, true);
  });
  this.observedRepositoryDrags = 0;
});

async function finishedDrag(world, source) {
  await expect.poll(() => world.page.evaluate(() => globalThis.__repositoryDragEvents.filter(event => event.type === "dragend").length))
    .toBe(world.observedRepositoryDrags + 1);
  world.observedRepositoryDrags += 1;
  const events = await world.page.evaluate(() => globalThis.__repositoryDragEvents);
  assert.equal(events.filter(event => event.type === "dragstart").length, world.observedRepositoryDrags);
  assert.equal(events.filter(event => event.type === "dragstart").at(-1).path, source);
  await saved(world.page);
  await expect(world.page.locator(".drag-source, .drop-target, [data-file-drop-root], [data-file-preview], .route-stem")).toHaveCount(0);
}

When("I hold repository entry {string} over folder {string}", async function (source, target) {
  const from = await row(this.page, source).boundingBox();
  const to = await row(this.page, target).boundingBox();
  assert.ok(from && to);
  this.previewDragSource = source;
  await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 });
  await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await this.page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2);
  await expect(row(this.page, target)).toHaveClass(/\bdrop-target\b/);
  await expect(treeItem(this.page, target)).toHaveAttribute("aria-expanded", "true");
});

Then("the tree previews {string} before {string} with a highlighted route", async function (destination, next) {
  const preview = this.page.locator(`[data-file-preview=${JSON.stringify(destination)}]`);
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("aria-hidden", "true");
  await expect(treeItem(this.page, destination)).toHaveCount(0);
  await expect(treeItem(this.page, this.previewDragSource)).toBeVisible();
  assert.equal(await preview.evaluate(element => element.nextElementSibling?.getAttribute("aria-label")), next);
  const parts = destination.split("/");
  const guides = [];
  for (let index = 1; index < parts.length; index++) {
    guides.push(treeItem(this.page, parts.slice(0, index).join("/")).locator(":scope > .tree-guides"));
  }
  guides.push(preview.locator(":scope > .tree-guides"));
  for (const guide of guides) {
    await expect(guide).toHaveClass(/\broute-to\b/);
    assert.equal(await guide.locator(".route-stem").evaluate(element => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-drop-foreground)";
      element.append(probe);
      const matches = getComputedStyle(element).backgroundColor === getComputedStyle(probe).color;
      probe.remove();
      return matches;
    }), true);
  }
  await this.page.locator(".files-section").screenshot({ path: "tmp/test/browser/drop-preview.png" });
});

When("I drop onto the preview of {string}", async function (destination) {
  const preview = this.page.locator(`[data-file-preview=${JSON.stringify(destination)}]`);
  const bounds = await preview.boundingBox();
  assert.ok(bounds);
  await this.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await this.page.mouse.move(bounds.x + bounds.width / 2 + 1, bounds.y + bounds.height / 2);
  await this.page.mouse.up();
  await finishedDrag(this, this.previewDragSource);
});

async function dragEntry(world, source, target) {
  await expect(row(world.page, source)).toHaveAttribute("draggable", "true");
  await row(world.page, source).dragTo(row(world.page, target));
  await finishedDrag(world, source);
}

When("I drag repository entry {string} onto {string}", async function (source, target) {
  await dragEntry(this, source, target);
});

When("I drag {string} onto {string} with a window blur before dropping", async function (source, target) {
  const from = await row(this.page, source).boundingBox();
  const to = await row(this.page, target).boundingBox();
  assert.ok(from && to);
  await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 });
  await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await this.page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2);
  await expect(row(this.page, target)).toHaveClass(/\bdrop-target\b/);
  // Playwright intercepts Chromium drags before the OS can affect window focus.
  await this.page.evaluate(() => window.dispatchEvent(new FocusEvent("blur")));
  await this.page.mouse.up();
  await finishedDrag(this, source);
});

When("the file navigator finishes hot replacement", async function () {
  await expect(this.page.getByRole("main", { name: "Code editor", exact: true, includeHidden: true })).toHaveAttribute("data-browser-hmr-generation", this.startupDocumentMarker);
  await saved(this.page);
  await expect(row(this.page, "file2.txt")).toHaveAttribute("draggable", "true");
});

When("I drag {string} into folder {string} after it slides open", async function (source, target) {
  if (await treeItem(this.page, target).getAttribute("aria-expanded") === "true") await row(this.page, target).click();
  const from = await row(this.page, source).locator(".file-name-text").boundingBox();
  const to = await row(this.page, target).boundingBox();
  assert.ok(from && to);
  await this.page.mouse.move(from.x + 10, from.y + from.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(from.x + 18, from.y + from.height / 2 + 8, { steps: 3 });
  await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await this.page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2);
  await expect(row(this.page, target)).toHaveClass(/\bdrop-target\b/);
  await expect(treeItem(this.page, target)).toHaveAttribute("aria-expanded", "true");
  await treeItem(this.page, target).evaluate(async item => {
    await Promise.all(item.getAnimations({ subtree: true }).map(animation => animation.finished));
  });
  await this.page.mouse.up();
  await finishedDrag(this, source);
});

When("I rapidly type {string} and drag {string} onto {string}", async function (text, source, target) {
  const input = this.page.getByLabel("Code editor document", { exact: true });
  await input.click();
  await input.press("Control+End");
  await input.pressSequentially(text);
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("Saving changes…");
  await dragEntry(this, source, target);
});

When("I drag repository entry {string} to blank navigator space", async function (source) {
  const target = this.page.locator(".files-section");
  const bounds = await target.boundingBox();
  assert.ok(bounds);
  await row(this.page, source).dragTo(target, { targetPosition: { x: bounds.width / 2, y: bounds.height - 15 } });
  await finishedDrag(this, source);
});

When("I cancel dragging {string} after hovering over folder {string}", async function (source, target) {
  if (await treeItem(this.page, target).getAttribute("aria-expanded") === "true") await row(this.page, target).click();
  const from = await row(this.page, source).boundingBox();
  const to = await row(this.page, target).boundingBox();
  assert.ok(from && to);
  await this.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await this.page.mouse.down();
  await this.page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 });
  await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  // Chromium needs another move after entering the target to emit dragover.
  await this.page.mouse.move(to.x + to.width / 2 + 1, to.y + to.height / 2);
  await expect.poll(() => this.page.evaluate(() => globalThis.__repositoryDragEvents.filter(event => event.type === "dragstart").length))
    .toBe(this.observedRepositoryDrags + 1);
  await expect(row(this.page, target)).toHaveClass(/\bdrop-target\b/);
  await expect(treeItem(this.page, target)).toHaveAttribute("aria-expanded", "true");
  await this.page.keyboard.press("Escape");
  await this.page.mouse.up();
  await finishedDrag(this, source);
  assert.equal(await this.page.evaluate(() => globalThis.__repositoryDragEvents.filter(event => event.type === "dragend").at(-1).effect), "none");
});
