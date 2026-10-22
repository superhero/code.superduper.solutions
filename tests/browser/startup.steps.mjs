// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { pageSelector, selectPage, selectDropdown } from "./navigation.helpers.mjs";

const loader = page => page.getByRole("status", { name: "Loading code editor", exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");
const storageFailure = "Startup fixture storage is unavailable.";
const drawings = page => loader(page).getByRole("article");

Then("Settings lists all upstream integrations without downloading their libraries", async function () {
  await selectPage(this.page, "Settings");
  const settings = this.page.getByRole("region", { name: "Upstream connections", exact: true });
  for (const provider of ["GitHub", "GitLab", "Bitbucket"]) {
    const card = settings.getByRole("region", { name: `${provider} integration`, exact: true });
    await expect(card.getByRole("button", { name: "Install", exact: true })).toBeEnabled();
  }
  assert.equal(this.requests.filter(request => /\/remotes\/.*\.remote\.json(?:\?|$)/.test(request.url)).length, 0);
});

async function assertDrawingLayout(page, count) {
  await expect(drawings(page)).toHaveCount(count);
  const layout = await drawings(page).evaluateAll(elements => elements.map(element => {
    const bounds = node => {
      const rect = node.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height };
    };
    return { id: element.dataset.stage, card: bounds(element), stage: bounds(element.querySelector(".stage")),
      drawing: bounds(element.querySelector(".drawing-frame")), width: innerWidth, height: innerHeight };
  }));
  for (const item of layout) {
    assert.ok(item.drawing.width > 0 && item.drawing.height > 0,
      `${item.id} must paint a drawing before JavaScript runs`);
    for (const [name, rect] of [["card", item.card], ["drawing", item.drawing]]) {
      assert.ok(rect.left >= -.5 && rect.top >= -.5 && rect.right <= item.width + .5 && rect.bottom <= item.height + .5,
        `${item.id} ${name} must fit the viewport before JavaScript runs: ${JSON.stringify(item)}`);
    }
    assert.ok(item.drawing.left >= item.stage.left - .5 && item.drawing.right <= item.stage.right + .5
      && item.drawing.top >= item.stage.top - .5 && item.drawing.bottom <= item.stage.bottom + .5,
    `${item.id} drawing must fit its stage without application JavaScript`);
  }
  const overflow = await loader(page).evaluate(element =>
    [document.documentElement, document.body, element, element.querySelector(".gallery"), element.querySelector(".studies")]
      .filter(node => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
      .map(node => node.id || node.className || node.tagName));
  assert.deepEqual(overflow, [], "The pre-JavaScript loading screen must not scroll");
}

When("I reload with application scripts disabled", async function () {
  const session = await this.context.newCDPSession(this.page);
  await session.send("Emulation.setScriptExecutionDisabled", { value: true });
  await this.page.reload({ waitUntil: "networkidle" });
});

Then("the startup screen covers the viewport and keeps the application inactive", async function () {
  await expect(loader(this.page)).toBeVisible();
  await expect(this.page.locator("#app")).toHaveAttribute("inert", "");
  await expect(this.page.locator("#app")).toHaveAttribute("aria-busy", "true");
  const geometry = await loader(this.page).evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.ok(geometry.left <= 0 && geometry.top <= 0 && geometry.right >= geometry.viewportWidth &&
    geometry.bottom >= geometry.viewportHeight, "The loading screen covers the entire viewport");
  await this.page.keyboard.press("Tab");
  assert.equal(await this.page.locator("#app").evaluate(element => element.contains(document.activeElement)),
    false, "Keyboard navigation cannot enter the workspace before startup finishes");
  // A painted, opaque overlay also hides the welcome page while the application
  // underneath is preparing; opacity alone is not Playwright's visibility test.
  const welcomeHidden = await this.page.evaluate(() => {
    const welcome = [...document.querySelectorAll("#app *")]
      .find(element => element.children.length === 0 && element.textContent.trim() === "A HEADLESS BROWSER IDE");
    if (!welcome) return true;
    for (let node = welcome; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return true;
    }
    const bounds = welcome.getBoundingClientRect();
    const overlay = document.getElementById("startup-status");
    const cover = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    if (!overlay || !cover || !overlay.contains(cover)) return false;
    const style = getComputedStyle(overlay);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const drawing = canvas.getContext("2d");
    drawing.fillStyle = style.backgroundColor;
    drawing.fillRect(0, 0, 1, 1);
    return Number(style.opacity) === 1 && drawing.getImageData(0, 0, 1, 1).data[3] === 255;
  });
  assert.equal(welcomeHidden, true, "The welcome page must not flash while the saved workspace is loading");
});

Then("the startup screen contains a loading stage", async function () {
  await expect(this.page.locator("#startup-stage")).toHaveCount(1);
  await expect(this.page.locator("#startup-stage")).not.toHaveText("");
});

Then("all nine startup drawings are visible and animated before JavaScript runs", async function () {
  await assertDrawingLayout(this.page, 9);
  await expect(loader(this.page).locator('article[data-status="pending"]')).toHaveCount(9);
  await expect(this.page.locator("#app main")).toHaveCount(0);
  for (const card of await drawings(this.page).all()) {
    await expect(card.locator("h2")).toBeHidden();
    await expect(card.locator(".sub-items, .compact-detail, [data-item]")).toHaveCount(0);
  }
  const painted = () => drawings(this.page).evaluateAll(elements => elements.map(element =>
    JSON.stringify([...element.querySelectorAll(".drawing-frame *")].map(node => {
      const style = getComputedStyle(node);
      return [style.transform, style.opacity, style.clipPath, style.strokeDashoffset, style.fill,
        style.color, style.backgroundColor];
    }))));
  const before = await painted();
  const changed = new Set();
  await expect.poll(async () => {
    for (const [index, state] of (await painted()).entries()) if (state !== before[index]) changed.add(index);
    return changed.size;
  }, { timeout: 5_000, message: "All nine drawings must visibly animate without application JavaScript" }).toBe(9);
});

Then("startup drawings fit compact screens before JavaScript runs", async function () {
  for (const viewport of [{ width: 390, height: 844, cards: 6 }, { width: 768, height: 1024, cards: 8 },
    { width: 320, height: 240, cards: 4 }]) {
    await this.page.setViewportSize({ width: viewport.width, height: viewport.height });
    await assertDrawingLayout(this.page, viewport.cards);
    for (const card of await drawings(this.page).all()) await expect(card.locator("h2")).toBeHidden();
  }
});

When("I reload while the application entry module is held", async function () {
  assert.equal(this.isDevelopment, true, "The held entry module uses the isolated Vite fixture");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  this.releaseStartupEntry = release;
  this.startupEntryRoute = async route => {
    this.startupEntryRequested = true;
    await gate;
    await route.continue();
  };
  await this.page.route(/\/index\.ts(?:\?|$)/, this.startupEntryRoute);
  await this.page.reload({ waitUntil: "commit" });
  await expect.poll(() => this.startupEntryRequested).toBe(true);
  await assertDrawingLayout(this.page, 9);
  await expect(this.page.locator("#app main")).toHaveCount(0);
  await this.page.evaluate(() => {
    const gallery = document.querySelector("#startup-status .gallery");
    const nodes = [...gallery.querySelectorAll(".drawing-frame")];
    globalThis.__startupPrerendered = { gallery, nodes,
      animations: nodes.flatMap(node => node.getAnimations({ subtree: true })) };
  });
});

When("I release the application entry module", async function () {
  this.releaseStartupEntry();
  await this.page.waitForLoadState("networkidle");
  await this.page.unroute(/\/index\.ts(?:\?|$)/, this.startupEntryRoute);
});

Then("startup hydration preserves the original drawings and their animation timelines", async function () {
  const continuity = await this.page.evaluate(() => {
    const before = globalThis.__startupPrerendered;
    const gallery = document.querySelector("#startup-status .gallery");
    const nodes = [...gallery.querySelectorAll(".drawing-frame")];
    const animations = new Set(nodes.flatMap(node => node.getAnimations({ subtree: true })));
    return { gallery: gallery === before.gallery,
      drawings: nodes.length === 9 && nodes.every((node, index) => node === before.nodes[index]),
      animations: before.animations.length > 0 && before.animations.every(animation => animations.has(animation)
        && animation.playState === "running") };
  });
  assert.deepEqual(continuity, { gallery: true, drawings: true, animations: true },
    "Hydration must reuse the first painted animation DOM and its CSS animation timelines");
});

Then("the startup cards report work still waiting for storage", async function () {
  const progress = this.page.getByRole("main", { name: "Loading progress" });
  await expect(progress).toBeVisible();
  await expect(progress.getByRole("article")).toHaveCount(9);
  await expect(progress.locator('article[data-stage="repository"]')).toHaveAttribute("data-status", "running");
  await expect(progress.locator('article[data-stage="files"]')).toHaveAttribute("data-status", "pending");
  await expect(progress.locator('article[data-stage="git"]')).toHaveAttribute("data-status", "pending");
  await expect(progress.locator('article[data-stage="editor"]')).toHaveAttribute("data-status", "pending");
});

When("I choose the saved startup appearance through Settings", async function () {
  await selectPage(this.page, "Settings");
  await selectDropdown(this.page, "Settings scope", "global");
  await selectDropdown(this.page, "Color mode", "dark");
  await saved(this.page);
  await selectDropdown(this.page, "Palette", "bonfire");
  await saved(this.page);
  await expect(this.page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(this.page.locator("html")).toHaveAttribute("data-palette", "bonfire");
  await selectPage(this.page, "Editor");
});

function holdStartupReads() {
    const send = Worker.prototype.postMessage;
    const held = [];
    let released = false;
    globalThis.__startupHeldRequests = held;
    globalThis.__releaseStartupRequests = () => {
      released = true;
      for (const { worker, message, options } of held) send.call(worker, message, ...options);
      Worker.prototype.postMessage = send;
    };
    Worker.prototype.postMessage = function (message, ...options) {
      if (!released && ["list", "loadPreferences"].includes(message?.method)) {
        held.push({ worker: this, message, options });
        return;
      }
      return send.call(this, message, ...options);
    };
    // Capture the first usable frame, before later assertions can hide an early
    // reveal followed by a delayed CodeMirror scroll restoration.
    let blocked = false;
    const observer = new MutationObserver(() => {
      const app = document.getElementById("app");
      if (!app) return;
      if (app.inert || app.getAttribute("aria-busy") === "true") { blocked = true; return; }
      if (!blocked) return;
      const scroll = app.querySelector(".cm-editor > .cm-scroller");
      globalThis.__startupFirstReveal = {
        active: app.querySelector('.file-tabs button.active')?.getAttribute("aria-label"),
        scroll: scroll ? { top: scroll.scrollTop, left: scroll.scrollLeft } : null,
      };
      observer.disconnect();
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["inert", "aria-busy"] });
}

Given("the next startup storage reads are held", async function () {
  await this.page.addInitScript(holdStartupReads);
});

Given("the next mounted startup storage reads are held", async function () {
  await this.page.evaluate(holdStartupReads);
});

When("the development application is hot replaced", async function () {
  assert.equal(this.isDevelopment, true, "Hot replacement must use the isolated Vite fixture");
  this.startupDocumentMarker = await this.page.evaluate(() => {
    globalThis.__startupDocumentMarker = crypto.randomUUID();
    return globalThis.__startupDocumentMarker;
  });
  await this.updateDevelopmentApp(this.startupDocumentMarker);
});

Then("the development application kept the same document", async function () {
  assert.equal(await this.page.evaluate(() => globalThis.__startupDocumentMarker), this.startupDocumentMarker,
    "A real component hot replacement must preserve the browser document");
});

When("I reload into the startup screen", async function () {
  await this.page.reload({ waitUntil: "networkidle" });
});

Then("the startup storage reads are pending", async function () {
  await expect.poll(() => this.page.evaluate(() => globalThis.__startupHeldRequests?.length)).toBe(2);
});

Then("the pending startup uses the saved appearance", async function () {
  await expect(this.page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(this.page.locator("html")).toHaveAttribute("data-palette", "bonfire");
});

When("I release the startup storage reads", async function () {
  await this.page.evaluate(() => {
    if (!globalThis.__releaseStartupRequests) throw new Error("The startup storage reads must be held first");
    const root = document.getElementById("startup-status");
    const timings = globalThis.__panePresentation = { panes: [...root.querySelectorAll("article")]
      .flatMap((pane, index) => pane.classList.contains("presented") ? [{ index, at: null }] : []), reveal: null };
    const observer = new MutationObserver(() => {
      for (const [index, pane] of [...root.querySelectorAll("article")].entries()) {
        if (pane.classList.contains("presented") && !timings.panes.some(entry => entry.index === index)) {
          timings.panes.push({ index, at: performance.now() });
        }
      }
      if (!document.getElementById("app").hasAttribute("inert")) {
        timings.reveal = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"] });
    observer.observe(document.getElementById("app"), { attributes: true, attributeFilter: ["inert"] });
    globalThis.__releaseStartupRequests();
  });
});

Then("the startup screen is removed and the application is available", async function () {
  await expect(this.page.locator("#startup-status")).toHaveCount(0);
  await expect(this.page.locator("#app")).not.toHaveAttribute("inert", "");
  await expect(this.page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
  await expect(pageSelector(this.page)).toBeEnabled();
});

Then("the first startup reveal already contained the restored document position", async function () {
  const reveal = await this.page.evaluate(() => globalThis.__startupFirstReveal);
  assert.equal(reveal?.active, "Switch to alpha.txt");
  assert.ok(reveal.scroll, "The selected editor is mounted before the application becomes usable");
  assert.ok(Math.abs(reveal.scroll.top - this.workspaceEditorPosition.top) <= 1 &&
    Math.abs(reveal.scroll.left - this.workspaceEditorPosition.left) <= 1,
  `The first reveal must use the restored scroll position: ${JSON.stringify(reveal.scroll)}`);
});

Given("the next startup repository read fails", async function () {
  this.expectedErrors.push(storageFailure);
  await this.page.addInitScript(messageText => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...options) {
      if (message?.method !== "list") return send.call(this, message, ...options);
      Worker.prototype.postMessage = send;
      queueMicrotask(() => this.dispatchEvent(new MessageEvent("message", {
        data: { id: message.id, error: { name: "Error", message: messageText } },
      })));
    };
  }, storageFailure);
});

Then("the startup storage failure is explained", async function () {
  await expect(this.page.getByRole("alert")).toContainText(storageFailure);
});

Given("reduced motion is preferred during startup", async function () {
  await this.page.emulateMedia({ reducedMotion: "reduce" });
});

Then("the startup screen has a running loading animation", async function () {
  await expect.poll(() => loader(this.page).evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation.playState === "running").length)).toBeGreaterThan(0);
});

Then("the startup screen has no running animation", async function () {
  const moving = await loader(this.page).evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation.playState === "running" || animation.pending).length);
  assert.equal(moving, 0, "Reduced motion disables both loading animation and startup transitions");
});

Then("ready pane backgrounds finished fading in order before the workspace appeared", async function () {
  const timings = await this.page.evaluate(() => globalThis.__panePresentation);
  assert.deepEqual(timings.panes.map(entry => entry.index).sort((a, b) => a - b), [0,1,2,3,4,5,6,7,8]);
  for (let index = 1; index < 9; index++) {
    if (timings.panes[index - 1].at === null) continue;
    assert.ok(timings.panes[index].at - timings.panes[index - 1].at >= 145,
      `Pane fades must not overlap: ${JSON.stringify(timings)}`);
  }
  assert.ok(timings.reveal - timings.panes[8].at >= 145, "Last pane finishes before reveal");
});
