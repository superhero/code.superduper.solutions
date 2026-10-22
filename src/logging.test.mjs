// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { logger } from "./lib/logger.ts";

function captureLogs(action) {
  const calls = [];
  const originals = { error: console.error, warn: console.warn, log: console.log };
  try {
    for (const method of Object.keys(originals)) console[method] = (...args) => calls.push({ method, args });
    action();
  } finally { Object.assign(console, originals); }
  return calls;
}

Then("a {string} diagnostic keeps the native error stack cause and context", function (level) {
  const cause = new Error("Original cause");
  const error = new Error("Original failure", { cause });
  const stack = error.stack;
  const context = { operation: "fixture" };
  const calls = captureLogs(() => logger[level]("Action failed", context, error));
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.method, "error");
  assert.equal(call.args[0], error);
  assert.equal(call.args[0].stack, stack);
  assert.equal(call.args[0].cause, cause);
  assert.equal(call.args.filter(value => value === error).length, 1);
  assert.ok(call.args.includes("[code]"));
  assert.ok(call.args.includes("Action failed"));
  assert.ok(call.args.includes(context));
  assert.ok(call.args.every(value => typeof value !== "symbol"));
});
Then("a {string} message uses the {string} console method", function (level, method) {
  const cause = new Error("Diagnostic context");
  const calls = captureLogs(() => level === "warn" ? logger.warn("Fixture message", cause) : logger[level]("Fixture message"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, method);
  assert.ok(calls[0].args.includes("Fixture message"));
  if (level === "warn") assert.ok(calls[0].args.includes(cause));
});
Then("scoped diagnostics preserve their subsystem and original error", function () {
  const error = new Error("Storage unavailable");
  const calls = captureLogs(() => logger.scope("storage").error("Could not save", error));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[0], error);
  assert.ok(calls[0].args.includes("[code > storage]"));
  assert.ok(calls[0].args.includes("Could not save"));
});
Then("an {string} logger reports only its original error", function (variant) {
  const error = new Error("Unscoped failure");
  const child = variant === "metadata"
    ? logger.child({ processors: [{ process: meta => ({ ...meta, scope: undefined }) }] })
    : logger.child();
  if (variant === "explicitly") child.unscope();
  assert.deepEqual(captureLogs(() => child.error(error)), [{ method: "error", args: [error] }]);
});
