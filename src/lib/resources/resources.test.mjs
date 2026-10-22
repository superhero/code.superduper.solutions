// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { appendSample, bounded, collectHeap, collectStorage, formatBytes, nonnegative, ratio } from "./browser.ts";
import { logarithmicTimeAxis, projectHistory, historyTicks } from "./history.ts";
import { collectPageMemory, pageMemoryUnavailable } from "./page-memory.ts";
import { createProcessingMonitor } from "./processing.ts";
import { inspectDatabases } from "./databases.ts";

async function withGlobals(values, run) {
  const descriptors = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
    return await run();
  } finally {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
const signal = () => new AbortController().signal;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

Then("missing resource APIs return unavailable values rather than zeros", async function () {
  await withGlobals({ navigator: {}, performance: {}, indexedDB: undefined }, async () => {
    assert.deepEqual(collectHeap(), { used: null, allocated: null, limit: null, error: null });
    const storage = await collectStorage(signal());
    assert.equal(storage.usage, null); assert.equal(storage.quota, null); assert.equal(storage.persisted, null);
    assert.match(storage.estimateError, /does not expose/); assert.match(storage.persistenceError, /does not expose/);
    const databases = await inspectDatabases(signal());
    assert.deepEqual(databases.databases, []); assert.match(databases.error, /unavailable/);
    assert.equal(formatBytes(null), "Unavailable");
  });
});

Then("resource samples accept only finite nonnegative measurements", async function () {
  for (const value of [undefined, null, false, "12", -1, Infinity, NaN]) assert.equal(nonnegative(value), null);
  assert.equal(nonnegative(0), 0); assert.equal(nonnegative(12.5), 12.5);
  await withGlobals({ navigator: { storage: { estimate: async () => ({ usage: -3, quota: NaN }), persisted: async () => "yes" } },
    performance: { memory: { usedJSHeapSize: 0, totalJSHeapSize: Infinity, jsHeapSizeLimit: 1000 } } }, async () => {
    assert.deepEqual(collectHeap(), { used: 0, allocated: null, limit: 1000, error: null });
    const storage = await collectStorage(signal());
    assert.equal(storage.usage, null); assert.equal(storage.quota, null); assert.equal(storage.persisted, null);
  });
  assert.equal(ratio(0, 100), 0); assert.equal(ratio(200, 100), 1); assert.equal(ratio(2, 0), null);
  assert.equal(ratio(null, 10), null); assert.equal(formatBytes(1024), "1 KiB");
});

Then("a denied storage estimate retains a readable persistence result", async function () {
  await withGlobals({ navigator: { storage: { estimate: async () => { throw new Error("Storage denied"); }, persisted: async () => false } } }, async () => {
    const result = await collectStorage(signal());
    assert.equal(result.usage, null); assert.equal(result.quota, null); assert.equal(result.persisted, false);
    assert.equal(result.estimateError, "Storage denied"); assert.equal(result.persistenceError, null);
  });
});

Then("resource storage requests do not overlap when a view leaves and reopens", async function () {
  const estimate = deferred(), persistence = deferred(); let estimates = 0, persistences = 0;
  await withGlobals({ navigator: { storage: { estimate: () => { estimates++; return estimate.promise; },
    persisted: () => { persistences++; return persistence.promise; } } } }, async () => {
    const left = new AbortController();
    const first = collectStorage(left.signal);
    await Promise.resolve(); left.abort(new Error("View left"));
    await assert.rejects(first, /View left/);
    const second = collectStorage(signal()), third = collectStorage(signal());
    await Promise.resolve(); assert.equal(estimates, 1); assert.equal(persistences, 1);
    estimate.resolve({ usage: 200, quota: 1000 }); persistence.resolve(true);
    const results = await Promise.all([second, third]);
    for (const result of results) assert.deepEqual(result, { usage: 200, quota: 1000, persisted: true, estimateError: null, persistenceError: null });
  });
});

Then("resource waits time out and abort without keeping their listeners", async function () {
  const operation = deferred(), controller = new AbortController();
  let listeners = 0;
  const tracked = { throwIfAborted: () => controller.signal.throwIfAborted(), get reason() { return controller.signal.reason; },
    addEventListener(...args) { listeners++; controller.signal.addEventListener(...args); },
    removeEventListener(...args) { listeners--; controller.signal.removeEventListener(...args); } };
  await assert.rejects(bounded(operation.promise, tracked, "Test measurement", 2), /did not respond/);
  assert.equal(listeners, 0);
  const cancelled = bounded(operation.promise, tracked, "Test measurement");
  controller.abort(new Error("Stopped")); await assert.rejects(cancelled, /Stopped/); assert.equal(listeners, 0);
  operation.resolve(42); assert.equal(await operation.promise, 42);
});

Then("processing samples deduplicate tasks reset intervals and disconnect cleanly", async function () {
  let now = 100, instance;
  class Observer {
    static supportedEntryTypes = ["longtask"];
    records = []; disconnected = false;
    constructor(callback) { this.callback = callback; instance = this; }
    observe(options) { assert.deepEqual(options, { type: "longtask" }); }
    takeRecords() { return this.records.splice(0); }
    disconnect() { this.disconnected = true; }
    emit(entries) { this.callback({ getEntries: () => entries }); }
  }
  const entry = (startTime, duration, entryType = "longtask") => ({ startTime, duration, entryType, attribution: [{ url: "secret" }] });
  await withGlobals({ performance: { now: () => now }, PerformanceObserver: Observer }, async () => {
    const monitor = createProcessingMonitor(); monitor.start();
    instance.emit([entry(90, 80), entry(110, 49), entry(120, 60), entry(120, 60), entry(121, NaN), entry(130, 100, "measure")]);
    instance.records.push(entry(140, 90)); now = 300;
    assert.deepEqual(monitor.read(), { longTasks: 2, longTaskTime: 150, blockingTime: 50, longestTask: 90, interval: 200, error: null });
    // A task that started in the previous sample but only just completed still counts once.
    instance.emit([entry(140, 90), entry(250, 80)]); now = 400;
    assert.deepEqual(monitor.read(), { longTasks: 1, longTaskTime: 80, blockingTime: 30, longestTask: 80, interval: 100, error: null });
    now = 500; assert.equal(monitor.read().longTasks, 0);
    monitor.stop(); assert.ok(instance.disconnected);
    instance.emit([entry(600, 100)]); assert.equal(monitor.read().longTasks, null);
    monitor.start(); assert.equal(monitor.read().longTasks, 0); monitor.stop();
  });
});

Then("processing observer failures report unavailable measurements", async function () {
  await withGlobals({ PerformanceObserver: undefined }, async () => {
    const monitor = createProcessingMonitor(); monitor.start();
    assert.equal(monitor.read().longTasks, null); assert.match(monitor.read().error, /does not support/); monitor.stop();
  });
  let disconnected = false;
  class BrokenObserver {
    static supportedEntryTypes = ["longtask"];
    observe() { throw new Error("Observer denied"); }
    disconnect() { disconnected = true; }
  }
  await withGlobals({ PerformanceObserver: BrokenObserver }, async () => {
    const monitor = createProcessingMonitor(); monitor.start();
    assert.equal(monitor.read().blockingTime, null); assert.equal(monitor.read().error, "Observer denied"); assert.ok(disconnected);
  });
});

Then("page memory explains missing secure context isolation and API support", async function () {
  for (const [secure, isolated, message] of [[false, false, /HTTPS/], [true, false, /isolation/], [true, true, /does not support/]]) {
    await withGlobals({ isSecureContext: secure, crossOriginIsolated: isolated, performance: {} }, async () => {
      assert.match(pageMemoryUnavailable(), message);
      const result = await collectPageMemory(signal()); assert.equal(result.total, null); assert.match(result.error, message);
    });
  }
});

Then("manual page memory measurements group bytes without retaining URLs", async function () {
  const native = deferred(); let calls = 0;
  await withGlobals({ isSecureContext: true, crossOriginIsolated: true, performance: {
    measureUserAgentSpecificMemory() { calls++; return native.promise; } } }, async () => {
    const controller = new AbortController(), first = collectPageMemory(controller.signal);
    await Promise.resolve(); controller.abort(new Error("Page hidden")); await assert.rejects(first, /Page hidden/);
    const second = collectPageMemory(signal()), third = collectPageMemory(signal());
    native.resolve({ bytes: 110, breakdown: [
      { bytes: 20, types: ["DOM", "JavaScript", "DOM"], attribution: [{ url: "private/file" }] },
      { bytes: 30, types: ["JavaScript", "DOM"] }, { bytes: 50, types: ["JavaScript"] },
      { bytes: 10 }, { bytes: -1, types: ["Invalid"] }, null,
    ] });
    const results = await Promise.all([second, third]); assert.equal(calls, 1);
    for (const result of results) {
      assert.deepEqual(result, { total: 110, groups: [{ label: "DOM + JavaScript", bytes: 50 }, { label: "JavaScript", bytes: 50 }, { label: "Other", bytes: 10 }], error: null });
      assert.ok(!JSON.stringify(result).includes("private/file"));
    }
  });
});

Then("invalid page memory totals do not become zero measurements", async function () {
  await withGlobals({ isSecureContext: true, crossOriginIsolated: true, performance: {
    measureUserAgentSpecificMemory: async () => ({ bytes: -1, breakdown: [] }) } }, async () => {
    const result = await collectPageMemory(signal());
    assert.equal(result.total, null); assert.deepEqual(result.groups, []); assert.match(result.error, /invalid page memory total/);
  });
});

Then("live resource samples retain the latest 1024 observations without mutating inputs", function () {
  const source = Array.from({ length: 1024 }, (_, index) => ({ at: index, heap: { used: index }, storage: {}, processing: {} }));
  const before = structuredClone(source), next = { at: 1024, heap: { used: null }, storage: {}, processing: {} };
  const result = appendSample(source, next);
  assert.equal(result.length, 1024); assert.equal(result[0].at, 1); assert.equal(result.at(-1).heap.used, null);
  assert.deepEqual(source, before); assert.equal(result.at(-1), next);
});

Then("resource time spacing decreases toward the left at every chart width", function () {
  for (const width of [160, 320, 800, 1180]) {
    const end = 10_000_000, axis = logarithmicTimeAxis(width, end);
    assert.equal(axis.x(end), axis.right);
    assert.ok(Math.abs(axis.x(axis.oldest) - axis.left) < 1e-8);
    assert.ok(Math.abs(axis.x(axis.oldest) - axis.x(axis.oldest - 2000) - 1) < 1e-8);
    const gaps = [0, .2, .4, .8].map(fraction => {
      const at = end - fraction * axis.duration;
      return axis.x(at) - axis.x(at - 2000);
    });
    assert.ok(gaps[0] > 10, "Recent readings retain more room than the older columns");
    for (let index = 1; index < gaps.length; index++) assert.ok(gaps[index] < gaps[index - 1]);
  }
});

Then("resource pixel columns retain their first last minimum and maximum readings", function () {
  const axis = logarithmicTimeAxis(800, 1_000_000);
  for (const values of [[4, 90, 0, 30, 6], [4, 0, 90, 30, 6]]) {
    const input = values.map(value => ({ at: axis.end - 5000, value }));
    const output = projectHistory(input, axis);
    assert.deepEqual(output.map(point => point.value), [values[0], values[1], values[2], values.at(-1)]);
    assert.equal(new Set(output.map(point => point.x)).size, 1);
    assert.ok(output.every(point => Number.isInteger(point.x)));
  }
});

Then("resource history projection preserves gaps zeros and the visible time boundary", function () {
  const axis = logarithmicTimeAxis(800, 1_000_000);
  const input = [{ at: axis.oldest - 1, value: 9999 }, { at: axis.oldest + 1, value: 5 },
    { at: axis.end - 100, value: null }, { at: axis.end - 90, value: 0 },
    { at: axis.end - 80, value: null }, { at: axis.end, value: 4 }, { at: NaN, value: 100 }];
  const before = structuredClone(input), output = projectHistory(input, axis);
  assert.deepEqual(output.map(point => point.value), [5, null, 0, null, 4]);
  assert.ok(output.every(point => point.x >= axis.left && point.x <= axis.right));
  assert.deepEqual(input, before);
  const columns = [...new Set(output.map(point => point.x))];
  for (let index = 1; index < columns.length; index++) assert.ok(columns[index] - columns[index - 1] >= 1);
});

Then("resource time ticks remain readable across chart widths", function () {
  for (const width of [25, 160, 320, 800, 1180]) {
    const axis = logarithmicTimeAxis(width, 1_000_000), ticks = historyTicks(axis);
    assert.equal(ticks.at(-1).label, "Latest"); assert.equal(ticks.at(-1).x, axis.right);
    for (let index = 1; index < ticks.length; index++) assert.ok(ticks[index].x - ticks[index - 1].x >= 72);
    assert.ok(ticks.every(tick => tick.x >= axis.left && tick.x <= axis.right));
    if (width > 100) assert.equal(ticks[0].x, axis.left);
  }
});
