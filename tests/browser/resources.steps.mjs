// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { selectPage, selectDropdown } from "./navigation.helpers.mjs";

const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
const button = (page, name) => page.getByRole("button", { name, exact: true });
const dashboard = page => page.getByRole("region", { name: "Resources", exact: true });
const metric = (page, section, label) => dashboard(page).getByRole("region", { name: section, exact: true }).locator(".metrics > div").filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) }).locator("dd");
const sampleCount = page => page.locator(".resources-page").getAttribute("data-samples").then(Number);
async function ready(page) {
  await expect.poll(() => sampleCount(page)).toBeGreaterThan(0);
  await expect(button(page, "Refresh resources")).toBeEnabled();
  await saved(page);
}

Then("browser resource cards charts and database counts are readable and responsive", { timeout: 60_000 }, async function () {
  const page = this.page;
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("resource-fixture.v1", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("first"); request.result.createObjectStore("second"); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(["first", "second"], "readwrite");
      tx.objectStore("first").put("private-resource-fixture-value", 1); tx.objectStore("first").put("other", 2); tx.objectStore("second").put("third", 1);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await selectPage(page, "Resources"); await ready(page);
  for (const name of ["Processing", "Memory", "Storage", "Repositories", "IndexedDB records", "Live resource history"])
    await expect(dashboard(page).getByRole("region", { name, exact: true })).toBeVisible();
  await expect(page.locator('[data-resources-panel]').getByRole('button',{name:'Undo',exact:true})).toHaveCount(0);
  await expect(metric(page, "Repositories", "Local repositories")).toHaveText("1");
  await expect(metric(page, "Repositories", "Files in current repository")).toHaveText("1");
  await expect(metric(page, "Storage", "Used storage")).not.toHaveText("Unavailable");
  const fixture = page.locator("details.database").filter({ hasText: "resource-fixture.v1" });
  await expect(fixture.locator("summary")).toContainText("3 records"); await fixture.locator("summary").click();
  await expect(fixture.locator(".store-list > div")).toHaveCount(2);
  await expect(fixture.locator(".store-list > div").filter({ hasText: "first" }).locator("dd")).toHaveText("2");
  await expect(dashboard(page)).not.toContainText("private-resource-fixture-value");
  for (const choice of ["storage", "blocking", "heap"]) {
    await selectDropdown(page, "Chart metric", choice);
    await expect(dashboard(page).getByRole("img")).toBeVisible();
  }
  await mkdir(this.artifactDirectory, { recursive: true });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await dashboard(page).evaluate(node => node.scrollTop = 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Resources fits the page width");
    assert.ok(await dashboard(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1), "Cards do not overflow the Resources panel");
    await button(page, "Pause monitoring").focus(); await expect(button(page, "Pause monitoring")).toBeFocused();
    await page.keyboard.press("Tab"); await expect(button(page, "Refresh resources")).toBeFocused();
    await expect(page.getByRole("tooltip", { name: "Refresh resources", exact: true })).toBeVisible();
    await button(page, "Pause monitoring").click();
    await expect(button(page, "Resume monitoring")).toBeVisible();
    await button(page, "Resume monitoring").click();
    await expect(button(page, "Refresh resources")).toBeEnabled();
    await page.screenshot({ path: join(this.artifactDirectory, `resources-${width}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await dashboard(page).evaluate(node => node.scrollTop = 260);
  await expect.poll(() => dashboard(page).evaluate(node => node.scrollTop)).toBe(260);
  // Ordinary passive workspace position persistence is debounced by the app.
  await page.waitForTimeout(450); await page.reload(); await saved(page);
  await expect(dashboard(page)).toBeVisible(); await ready(page);
  await expect.poll(() => dashboard(page).evaluate(node => node.scrollTop)).toBe(260);
  await selectPage(page, "Editor"); await selectPage(page, "Resources"); await ready(page);
  await expect(dashboard(page)).not.toContainText("private-resource-fixture-value");
});

Then("unavailable browser resource APIs are shown honestly", async function () {
  await this.page.evaluate(() => {
    Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
    Object.defineProperty(performance, "memory", { configurable: true, value: undefined });
    Object.defineProperty(performance, "measureUserAgentSpecificMemory", { configurable: true, value: undefined });
    Object.defineProperty(globalThis, "PerformanceObserver", { configurable: true, value: undefined });
    Object.defineProperty(indexedDB, "databases", { configurable: true, value: undefined });
  });
  await selectPage(this.page, "Resources"); await ready(this.page);
  for (const [section, label] of [["Memory", "Used heap"], ["Storage", "Used storage"], ["Processing", "Long tasks"], ["IndexedDB records", "Readable records"]])
    await expect(metric(this.page, section, label)).toHaveText("Unavailable");
  await expect(button(this.page, "Measure page memory")).toBeDisabled();
  await expect(dashboard(this.page)).toContainText("This browser does not support long-task measurements.");
  await expect(dashboard(this.page)).toContainText("This browser cannot enumerate existing databases.");
  await expect(dashboard(this.page)).toContainText("Used JavaScript heap is unavailable in this browser.");
});

Then("failed storage estimates preserve persistence information in Resources", async function () {
  await this.page.evaluate(() => Object.defineProperty(navigator, "storage", { configurable: true,
    value: { estimate: async () => { throw new Error("Resource fixture storage denied"); }, persisted: async () => true } }));
  await selectPage(this.page, "Resources"); await ready(this.page);
  await expect(metric(this.page, "Storage", "Used storage")).toHaveText("Unavailable");
  await expect(metric(this.page, "Storage", "Persistence")).toHaveText("Persistent");
  await expect(dashboard(this.page)).toContainText("Resource fixture storage denied");
});

Then("page memory is manual and displays aggregate categories without attribution", async function () {
  await this.page.evaluate(() => {
    window.__memoryCalls = 0;
    Object.defineProperty(performance, "measureUserAgentSpecificMemory", { configurable: true, value: async () => {
      window.__memoryCalls++;
      return { bytes: 4096, breakdown: [{ bytes: 3072, types: ["JavaScript"], attribution: [{ url: "secret-fixture-url" }] }, { bytes: 1024, types: ["DOM"] }] };
    } });
  });
  await selectPage(this.page, "Resources"); await ready(this.page);
  assert.equal(await this.page.evaluate(() => window.__memoryCalls), 0);
  await button(this.page, "Measure page memory").click();
  await expect(metric(this.page, "Memory", "Measured page memory")).toHaveText("4 KiB");
  await expect(dashboard(this.page).locator(".memory-groups")).toContainText("JavaScript");
  await expect(dashboard(this.page).locator(".memory-groups")).toContainText("3 KiB");
  await expect(dashboard(this.page)).not.toContainText("secret-fixture-url");
  assert.equal(await this.page.evaluate(() => window.__memoryCalls), 1);
});

Then("browser monitoring pauses stops and shares unfinished requests", { timeout: 60_000 }, async function () {
  const page = this.page;
  await page.evaluate(() => {
    const observe = PerformanceObserver.prototype.observe, disconnect = PerformanceObserver.prototype.disconnect;
    const active = new Set(); window.__resourceObservers = active;
    PerformanceObserver.prototype.observe = function (options) { if (options.type === "longtask") active.add(this); return observe.call(this, options); };
    PerformanceObserver.prototype.disconnect = function () { active.delete(this); return disconnect.call(this); };
    window.__resourceCalls = 0;
    Object.defineProperty(navigator, "storage", { configurable: true, value: {
      estimate: () => { window.__resourceCalls++; return new Promise(resolve => { window.__releaseEstimate = () => resolve({ usage: 100, quota: 1000 }); }); },
      persisted: async () => false,
    } });
  });
  await selectPage(page, "Resources");
  await expect.poll(() => page.evaluate(() => window.__resourceCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__resourceObservers.size)).toBe(1);
  await selectPage(page, "Editor");
  await expect.poll(() => page.evaluate(() => window.__resourceObservers.size)).toBe(1);
  await selectPage(page, "Resources");
  await expect.poll(() => page.evaluate(() => window.__resourceObservers.size)).toBe(1);
  assert.equal(await page.evaluate(() => window.__resourceCalls), 1, "Reopening shares the unfinished native request");
  await page.evaluate(() => window.__releaseEstimate()); await ready(page);
  await button(page, "Pause monitoring").click();
  await expect.poll(() => page.evaluate(() => window.__resourceObservers.size)).toBe(0);
  const paused = await sampleCount(page), calls = await page.evaluate(() => window.__resourceCalls);
  await page.waitForTimeout(2200);
  assert.equal(await sampleCount(page), paused); assert.equal(await page.evaluate(() => window.__resourceCalls), calls);
  await button(page, "Resume monitoring").click();
  await expect.poll(() => page.evaluate(() => window.__resourceCalls)).toBe(calls + 1);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.__resourceObservers.size)).toBe(0);
  await page.evaluate(() => window.__releaseEstimate());
  assert.equal(await sampleCount(page), paused, "An unfinished hidden sample is discarded");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => page.evaluate(() => window.__resourceCalls)).toBe(calls + 2);
  await page.evaluate(() => window.__releaseEstimate()); await ready(page);
  await selectPage(page, "Editor");
  const stoppedCalls = await page.evaluate(() => window.__resourceCalls);
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(() => window.__resourceCalls), stoppedCalls + 1);
  assert.equal(await page.evaluate(() => window.__resourceObservers.size), 1);
  await page.evaluate(() => window.__releaseEstimate());
  await expect.poll(() => sampleCount(page)).toBeGreaterThan(paused + 1);
  const retained = await sampleCount(page);
  await selectPage(page, "Resources");
  assert.ok(await sampleCount(page) >= retained, "Readings survive navigation between views");
});

Then("resource database inspection never creates a missing database", async function () {
  const page = this.page;
  await page.evaluate(() => {
    const enumerate = indexedDB.databases.bind(indexedDB);
    Object.defineProperty(indexedDB, "databases", { configurable: true, value: async () =>
      [...await enumerate(), { name: "resource-absent-fixture", version: 1 }] });
    window.__actualDatabaseNames = async () => (await enumerate()).map(database => database.name);
  });
  await selectPage(page, "Resources"); await ready(page);
  await expect(page.locator("details.database").filter({ hasText: "resource-absent-fixture" })).toHaveCount(0);
  assert.ok(!(await page.evaluate(() => window.__actualDatabaseNames())).includes("resource-absent-fixture"));
  await button(page, "Refresh resources").click(); await ready(page);
  assert.ok(!(await page.evaluate(() => window.__actualDatabaseNames())).includes("resource-absent-fixture"));
});

Then("live and paused resource monitoring report page rendering costs", { timeout: 90_000 }, async function () {
  const page = this.page;
  await selectPage(page, "Resources"); await ready(page);
  await this.context.tracing.stop();
  const cdp = await this.context.newCDPSession(page); await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(item => [item.name, item.value]));
  const samples = [];
  try {
    for (let pair = 0; pair < 3; pair++) for (const live of pair % 2 ? [true, false] : [false, true]) {
      const state = await button(page, "Pause monitoring").count() > 0;
      if (live !== state) await button(page, state ? "Pause monitoring" : "Resume monitoring").click();
      if (live) await expect(button(page, "Refresh resources")).toBeEnabled();
      const countBefore = await sampleCount(page), before = await metrics();
      // A fixed window is intentional: compare sustained sampling with the same paused dashboard.
      await page.waitForTimeout(4250);
      const after = await metrics(), countAfter = await sampleCount(page);
      if (live) assert.ok(countAfter > countBefore); else assert.equal(countAfter, countBefore);
      samples.push({ pair, live, seconds: after.Timestamp - before.Timestamp, samples: countAfter - countBefore,
        taskMs: (after.TaskDuration - before.TaskDuration) * 1000, scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
        styleMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        nodes: after.Nodes, heapUsed: after.JSHeapUsedSize });
    }
  } finally { await cdp.detach(); await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true }); }
  const report = { note: "Production Chromium page counters, 1280×900, dark Bonfire, reduced motion, no repository. No tracing/snapshots or CPU profiler during timed windows. Worker and browser-process CPU are outside this sample.", samples };
  await mkdir(this.artifactDirectory, { recursive: true });
  await writeFile(join(this.artifactDirectory, "resource-monitoring-cost.json"), JSON.stringify(report, null, 2) + "\n");
  await this.attach(JSON.stringify(report, null, 2), "application/vnd.code.resource-monitoring+json");
});

Then("logarithmic resource history retains recent detail and readable labels after resizing", async function () {
  const page = this.page;
  await page.evaluate(async () => (await import("/test-fixtures/resource-history.ts")).mountResourceHistory());
  const fixture = page.getByRole("region", { name: "Resource history fixture", exact: true });
  await expect(fixture.getByRole("img")).toHaveAccessibleName(/logarithmic time scale/);
  await mkdir(this.artifactDirectory, { recursive: true });
  for (const width of [900, 320, 160, 900]) {
    await fixture.evaluate((node, width) => node.style.width = `${width}px`, width);
    await expect.poll(() => fixture.locator("svg.chart").evaluate(svg => Math.abs(svg.viewBox.baseVal.width - svg.getBoundingClientRect().width))).toBeLessThan(1);
    const result = await fixture.evaluate(node => {
      const svg = node.querySelector("svg.chart"), rect = svg.getBoundingClientRect();
      const points = [...node.querySelector("path.series").getAttribute("d").matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
      const columns = [...new Set(points.map(point => point.x))];
      const scale = rect.width / svg.viewBox.baseVal.width;
      const gaps = columns.slice(1).map((x, index) => (x - columns[index]) * scale);
      const labels = [...node.querySelectorAll(".chart-scale span")].map(label => {
        const bounds = label.getBoundingClientRect(); return { left: bounds.left, right: bounds.right, text: label.textContent };
      });
      return { width: rect.width, vertices: points.length, columns: columns.length,
        minimumGap: Math.min(...gaps), olderGap: gaps[0], recentGap: gaps.at(-1),
        left: rect.left, right: rect.right, labels };
    });
    assert.ok(result.minimumGap >= .99, "Distinct columns remain at least one CSS pixel apart");
    assert.ok(result.olderGap <= 2 && result.recentGap >= 8 && result.recentGap > result.olderGap,
      "Old readings compress toward one pixel while recent readings remain wide");
    assert.ok(result.columns <= Math.ceil(result.width));
    if (width === 900) assert.ok(result.vertices > 60, "The view retains more than the former sixty-reading window");
    for (let index = 1; index < result.labels.length; index++) assert.ok(result.labels[index].left >= result.labels[index - 1].right - 1);
    assert.ok(result.labels[0].left >= result.left && result.labels.at(-1).right <= result.right + 1);
    await page.screenshot({ path: join(this.artifactDirectory, `log-history-${width}.png`) });
  }
  for (const metric of ["storage", "blocking", "heap"]) {
    await selectDropdown(page, "Chart metric", metric);
    await expect(fixture.getByRole("img")).toBeVisible();
    await expect(fixture.locator(".chart-scale")).toContainText("Latest");
  }
});

Then("persistent storage is requested once and warnings reflect its actual status", async function () {
  const page = this.page;
  await page.evaluate(() => {
    window.__persistent = false;
    window.__persistRequests = 0;
    Object.defineProperty(navigator, "storage", { configurable: true, value: {
      estimate: async () => ({ usage: 1024, quota: 4096 }),
      persisted: async () => window.__persistent,
      persist: async () => { window.__persistRequests++; return window.__persistent = true; }
    } });
  });
  await selectPage(page, "Resources"); await ready(page);
  await expect(metric(page, "Storage", "Persistence")).toHaveText("Persistent");
  await expect(dashboard(page)).not.toContainText("The browser may clear best-effort storage");
  await expect(dashboard(page)).not.toContainText("Estimated storage used by this site");
  await selectPage(page, "Editor"); await selectPage(page, "Resources");
  assert.equal(await page.evaluate(() => window.__persistRequests), 1);
  await page.evaluate(() => { window.__persistent = false; });
  await button(page, "Refresh resources").click();
  await expect(metric(page, "Storage", "Persistence")).toHaveText("Best effort");
  await expect(dashboard(page)).toContainText("The browser may clear best-effort storage");
});

Then("the Resources chart shows its title and metric picker without a summary row", async function () {
  await selectPage(this.page, "Resources");
  const chart = this.page.getByRole("region", { name: "Live resource history", exact: true });
  await expect(chart.getByRole("heading", { name: "Resources", exact: true })).toBeVisible();
  await expect(chart.locator(".chart-summary strong")).toBeVisible();
  await expect(chart.locator(".chart-summary")).not.toContainText("Used JavaScript heap");
  await expect(chart.getByText("Used JavaScript heap", { exact: true })).toHaveCount(1);
  await expect(chart.getByRole("button", { name: "Pause monitoring", exact: true })).toHaveCount(0);
  await expect(chart.getByRole("button", { name: "Refresh resources", exact: true })).toHaveCount(0);
});
