// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

Then("the page has its application title and an accessible editor shell", async function () {
  await expect(this.page).toHaveTitle("code.superduper.solutions");
  const surface = this.page.getByRole("main", { name: "Code editor", exact: true });
  await expect(surface).toHaveCount(1);
  await expect(surface).toBeVisible();
  await expect(this.page.getByRole("button", { name: "Repository", exact: true })).toBeEnabled();
  await expect(this.page.locator(".topbar").getByRole("heading", { name: "Editor", exact: true })).toBeVisible();
});
Then("the application makes no runtime asset requests", function () {
  const allowed = ["/", "/favicon.ico", "/favicon.png", "/apple-touch-icon.png"].map(path => `${this.baseURL}${path}`);
  assert.deepEqual(this.requests.filter(request => !allowed.includes(request.url)), []);
});
Then("the page declares stable raster fallbacks and retains its embedded SVG icon", async function () {
  const links = await this.page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]')
    .evaluateAll(elements => elements.map(element => ({ rel: element.rel, href: element.getAttribute("href"), type: element.type, sizes: element.sizes.value })));
  assert.equal(links.length, 4, "Only ICO, PNG, SVG, and Apple touch icons should be declared");
  for (const [href, rel, type, sizes] of [
    ["./favicon.ico", "icon", "image/x-icon", "16x16 32x32 48x48"],
    ["./favicon.png", "icon", "image/png", "96x96"],
    ["./apple-touch-icon.png", "apple-touch-icon", "image/png", "180x180"],
  ]) {
    const link = links.find(link => link.href === href);
    assert.ok(link, `Missing stable fallback: ${href}`);
    assert.deepEqual(link, { rel, href, type, sizes });
  }
  const svg = links.find(link => link.type === "image/svg+xml");
  assert.ok(svg, "Missing scalable favicon");
  assert.equal(svg.rel, "icon");
  assert.equal(svg.sizes, "any");
  assert.match(svg.href, /^data:image\/svg\+xml[;,]/);
  assert.equal(links.filter(link => link.rel === "icon").at(-1), svg,
    "The scalable candidate must follow equally suitable raster candidates");
});

Then("the hosted favicon {string} is available as {string}", async function (filename, type) {
  // Playwright 1.63 aborts intercepted URLs ending /favicon.ico before route
  // handlers run. Its HTTP client still verifies the exact hosted asset URL.
  if (filename === "favicon.ico") {
    const response = await this.context.request.get(`${this.baseURL}/${filename}`);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()["content-type"]?.split(";")[0], type);
    assert.ok((await response.body()).byteLength > 0);
    return;
  }
  const result = await this.page.evaluate(async filename => {
    const response = await fetch(`./${filename}`);
    return { status: response.status, type: response.headers.get("content-type"), size: (await response.arrayBuffer()).byteLength };
  }, filename);
  assert.equal(result.status, 200);
  assert.equal(result.type?.split(";")[0], type);
  assert.ok(result.size > 0, `${filename} must contain an actual image payload`);
});

Then("Chromium decodes favicon {string} as {int} by {int} pixels", async function (filename, width, height) {
  let source = `./${filename}`;
  if (filename === "favicon.ico") {
    // Exercise Chromium's decoder with the exact HTTP bytes despite Playwright's
    // special favicon routing suppression, without inventing a second icon URL.
    const response = await this.context.request.get(`${this.baseURL}/${filename}`);
    assert.equal(response.status(), 200);
    source = `data:image/x-icon;base64,${(await response.body()).toString("base64")}`;
  }
  const dimensions = await this.page.evaluate(async source => {
    const image = new Image();
    image.src = source;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, source);
  assert.deepEqual(dimensions, { width, height });
});
Then("the production document is cross-origin isolated", async function () {
  assert.equal(await this.page.evaluate(() => crossOriginIsolated), true);
});
When("the browser viewport is {int} by {int} pixels", async function (width, height) {
  await this.page.setViewportSize({ width, height });
});
Then("the editor fills the viewport without horizontal overflow", async function () {
  const dimensions = await this.page.locator("#app main").evaluate(element => {
    const box = element.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight, documentWidth: document.documentElement.scrollWidth };
  });
  assert.equal(dimensions.left, 0);
  assert.equal(dimensions.top, 0);
  assert.ok(Math.abs(dimensions.width - dimensions.viewportWidth) <= 1);
  assert.ok(dimensions.height >= dimensions.viewportHeight);
  assert.ok(dimensions.documentWidth <= dimensions.viewportWidth);
});
Then("the bundled {string} font can be loaded by the browser", async function (family) {
  const loaded = await this.page.evaluate(async family => {
    const matches = await document.fonts.load(`16px "${family}"`);
    return { count: matches.length, loaded: matches.every(face => face.status === "loaded") };
  }, family);
  assert.ok(loaded.count > 0, `No bundled font face matches ${family}.`);
  assert.equal(loaded.loaded, true);
});
Then("production contains no development overlay or toolbar runtime", async function () {
  assert.deepEqual(await this.page.evaluate(() => ({
    overlay: typeof globalThis.__visulima_overlay__, toolbar: Boolean(customElements.get("dev-toolbar")),
    client: performance.getEntriesByType("resource").some(entry => entry.name.includes("/@vite/client")),
  })), { overlay: "undefined", toolbar: false, client: false });
  await expect(this.page.locator("dev-toolbar")).toHaveCount(0);
});
When("the document uses the {string} appearance mode", async function (mode) {
  await this.page.evaluate(mode => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, mode);
});
Then("the page background and foreground match the active semantic colors", async function () {
  const colors = await this.page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const probe = document.createElement("span");
    root.append(probe);
    probe.style.color = "var(--color-background)";
    const background = getComputedStyle(probe).color;
    probe.style.color = "var(--color-foreground)";
    const foreground = getComputedStyle(probe).color;
    probe.remove();
    return { actualBackground: style.backgroundColor, actualForeground: style.color, background, foreground, scheme: style.colorScheme, theme: root.dataset.theme };
  });
  assert.equal(colors.actualBackground, colors.background);
  assert.equal(colors.actualForeground, colors.foreground);
  assert.equal(colors.scheme, colors.theme);
});
