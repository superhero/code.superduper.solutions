// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const overlayFor = page => page.getByRole("dialog", { name: "Runtime Error Overlay", exact: true });

async function oneOverlay(world) {
  const overlay = overlayFor(world.page);
  await expect(overlay).toBeVisible();
  await expect.poll(() => world.overlayFrames.length).toBe(1);
  await world.page.waitForTimeout(300);
  assert.equal(world.overlayFrames.length, 1, "A diagnostic must be reported exactly once.");
  return overlay;
}

Then("the developer toolbar is hidden by default", async function () {
  await expect(this.page.locator("dev-toolbar")).toBeHidden();
  await expect(overlayFor(this.page)).toHaveCount(0);
});
When("I enable developer tools through the development URL", async function () {
  await this.page.goto(`${this.baseURL}/?dev-tools=1`, { waitUntil: "networkidle" });
});
Then("the developer toolbar is visible", async function () {
  await expect(this.page.locator("dev-toolbar")).toBeVisible();
});
When("I open a second development page", async function () {
  await expect(this.page.locator("dev-toolbar")).toBeVisible();
  await this.page.evaluate(() => {
    globalThis.__fixtureToolbar = document.querySelector("dev-toolbar");
    globalThis.__fixtureToolbarApi = globalThis.__VISULIMA_DEVTOOLS__;
  });
  this.toolbarInitializationsBeforeSecondPage = this.toolbarInitializations.filter(page => page === "primary").length;
  this.companionPage = await this.context.newPage();
  this.observePage(this.companionPage);
  await this.companionPage.goto(`${this.baseURL}/?dev-tools=1`, { waitUntil: "networkidle" });
  await expect(this.companionPage.locator("dev-toolbar")).toBeVisible();
});
Then("each page has one toolbar and the first toolbar retains its identity", async function () {
  await expect(this.page.locator("dev-toolbar")).toHaveCount(1);
  await expect(this.companionPage.locator("dev-toolbar")).toHaveCount(1);
  assert.deepEqual(await this.page.evaluate(() => ({
    element: document.querySelector("dev-toolbar") === globalThis.__fixtureToolbar,
    api: globalThis.__VISULIMA_DEVTOOLS__ === globalThis.__fixtureToolbarApi,
  })), { element: true, api: true });
  assert.equal(this.toolbarInitializations.filter(page => page === "primary").length, this.toolbarInitializationsBeforeSecondPage);
  const configuration = await this.page.evaluate(() => globalThis.__VISULIMA_DEVTOOLS__.rpc.getViteConfig());
  assert.equal(configuration.mode, "development", "Toolbar RPC must remain connected after another tab opens.");
  await this.companionPage.close();
});
When("the isolated development server restarts", async function () {
  await expect(this.page.locator("dev-toolbar")).toBeVisible();
  await this.page.evaluate(() => { globalThis.__fixtureBeforeRestart = true; });
  this.toolbarInitializationsBeforeRestart = this.toolbarInitializations.filter(page => page === "primary").length;
  await Promise.all([
    this.page.waitForNavigation({ waitUntil: "networkidle", timeout: 60_000 }),
    this.restartDevelopmentServer(),
  ]);
});
Then("the reloaded page has one usable toolbar", async function () {
  await this.page.locator("#app main").waitFor({ state: "attached" });
  await expect(this.page.locator("dev-toolbar")).toHaveCount(1);
  await expect(this.page.locator("dev-toolbar")).toBeVisible();
  assert.equal(await this.page.evaluate(() => globalThis.__fixtureBeforeRestart), undefined);
  assert.equal(this.toolbarInitializations.filter(page => page === "primary").length, this.toolbarInitializationsBeforeRestart + 1);
  const configuration = await this.page.evaluate(() => globalThis.__VISULIMA_DEVTOOLS__.rpc.getViteConfig());
  assert.equal(configuration.mode, "development", "Toolbar RPC must reconnect after a server restart.");
});
When("the isolated development fixture throws a native error", async function () {
  this.expectedErrors.push("Fixture native runtime failure.");
  this.scrollBeforeOverlay = await this.page.evaluate(() => {
    const main = document.querySelector("#app main");
    main.style.minHeight = "200vh";
    window.scrollTo(0, 100);
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return { y: scrollY, contentWidth: main.getBoundingClientRect().width,
      gutter: innerWidth - root.getBoundingClientRect().width,
      overflow: style.overflow, padding: parseFloat(style.paddingInlineEnd) || 0 };
  });
  assert.equal(this.scrollBeforeOverlay.y, 100, "The fixture must be scrollable before the overlay opens.");
  assert.ok(this.scrollBeforeOverlay.gutter > 0, "The regression requires the real scrollbar gutter.");
  await this.page.evaluate(async () => (await import("/test-fixtures/development-errors.ts")).throwRuntimeError());
});
Then("one error overlay displays the native fixture source", async function () {
  const overlay = await oneOverlay(this);
  await expect(overlay.locator("#__v_o__message")).toHaveText("Fixture native runtime failure.");
  await expect(overlay.locator("#__v_o__filelink")).toContainText("development-errors.ts");
  await expect(overlay.locator(".shiki").first()).toContainText("throw new Error");
});
Then("the overlay locks page scrolling without shifting the page content", async function () {
  await expect(this.page.locator("html")).toHaveAttribute("data-error-overlay-open", "");
  const state = await this.page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { overflow: style.overflow, padding: parseFloat(style.paddingInlineEnd),
      contentWidth: document.querySelector("#app main").getBoundingClientRect().width, y: scrollY };
  });
  assert.equal(state.overflow, "hidden");
  assert.ok(Math.abs(state.padding - this.scrollBeforeOverlay.padding - this.scrollBeforeOverlay.gutter) <= 1);
  assert.ok(Math.abs(state.contentWidth - this.scrollBeforeOverlay.contentWidth) <= 1, "Removing the scrollbar must not shift the content.");
  assert.equal(state.y, this.scrollBeforeOverlay.y);
  await this.page.mouse.move(20, 20);
  await this.page.mouse.wheel(0, 300);
  await this.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await this.page.evaluate(() => scrollY), this.scrollBeforeOverlay.y);
});
Then("dismissing the overlay restores page scrolling and its original gutter", async function () {
  const overlay = overlayFor(this.page);
  await overlay.getByRole("button", { name: "Close error overlay", exact: true }).click();
  await expect(overlay).toBeHidden();
  await expect(this.page.locator("html")).not.toHaveAttribute("data-error-overlay-open", "");
  const state = await this.page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    return { overflow: style.overflow, padding: parseFloat(style.paddingInlineEnd) || 0,
      gutter: innerWidth - root.getBoundingClientRect().width,
      contentWidth: document.querySelector("#app main").getBoundingClientRect().width, y: scrollY };
  });
  assert.equal(state.overflow, this.scrollBeforeOverlay.overflow);
  assert.equal(state.padding, this.scrollBeforeOverlay.padding);
  assert.equal(state.gutter, this.scrollBeforeOverlay.gutter);
  assert.equal(state.contentWidth, this.scrollBeforeOverlay.contentWidth);
  assert.equal(state.y, this.scrollBeforeOverlay.y);
  await this.page.evaluate(() => window.scrollBy(0, 100));
  assert.equal(await this.page.evaluate(() => scrollY), this.scrollBeforeOverlay.y + 100);
});
When("the isolated development fixture logs an error with a cause", async function () {
  this.expectedErrors.push("Fixture logged application failure.");
  await this.page.evaluate(async () => (await import("/test-fixtures/development-errors.ts")).logTestError());
});
Then("one error overlay displays the logged error and its cause", async function () {
  const overlay = await oneOverlay(this);
  await expect(overlay).toContainText("Fixture logged application failure.");
  await expect(overlay).toContainText("Fixture underlying failure.");
  assert.equal(this.overlayFrames[0].cause?.message, "Fixture underlying failure.");
});
When("the isolated page reports a primitive rejection", async function () {
  await this.page.evaluate(() => window.dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {
    reason: 0, promise: Promise.resolve(), cancelable: true,
  })));
});
Then("one error overlay explains the primitive rejection without invented source frames", async function () {
  const overlay = await oneOverlay(this);
  await expect(overlay.locator("#__v_o__message")).toHaveText(/Unhandled promise rejection: \+?0/);
  const payload = await overlay.evaluate(element => element.getRootNode().host.__v_oPayload);
  const error = payload.errors[0];
  assert.ok(!error.originalFilePath);
  assert.doesNotMatch(error.originalStack || error.stack || "", /\n\s*at |runtime-error\.ts|error-chain\.ts/);
});
