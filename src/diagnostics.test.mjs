// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { normalizeRuntimeError } from "./dev/runtime-error.ts";
import { getErrorChain, rememberErrorChain } from "./dev/error-chain.ts";

Then("normalizing a native exception preserves its identity stack and cause", function () {
  const cause = new Error("Root cause");
  const error = new TypeError("Native failure", { cause });
  const stack = error.stack;
  const result = normalizeRuntimeError(error, { kind: "error", message: "Less useful event text" });
  assert.equal(result, error);
  assert.equal(result.stack, stack);
  assert.equal(result.cause, cause);
});
Then("a rejected {string} retains its original value and a useful message", function (label) {
  const values = { zero: 0, false: false, null: null, undefined, string: "Fixture rejection", bigint: 12n };
  const expected = { zero: "0", false: "false", null: "null", undefined: "undefined", string: "Fixture rejection", bigint: "12" };
  const error = normalizeRuntimeError(values[label], { kind: "rejection" });
  assert.equal(error.originalValue, values[label]);
  assert.equal(error.name, "UnhandledRejectionError");
  assert.ok(error.message.includes(expected[label]));
  assert.equal(error.stack, "");
  assert.equal(error.cause, undefined);
});
Then("a browser error without details has no fabricated stack", function () {
  const error = normalizeRuntimeError(null, { kind: "error" });
  assert.equal(error.name, "BrowserRuntimeError");
  assert.match(error.message, /without a message or exception details/);
  assert.equal(error.stack, "");
  assert.equal(error.originalValue, null);
});
Then("an error location retains its filename line and bounded column", function () {
  const error = normalizeRuntimeError(undefined, { kind: "error", message: "Source failure", filename: "http://127.0.0.1/source.ts", lineno: 7, colno: 0 });
  assert.equal(error.stack, "BrowserRuntimeError: Source failure\n    at http://127.0.0.1/source.ts:7:1");
});
Then("structured errors preserve custom names codes and existing stacks", function () {
  const value = { name: "FilesystemError", message: "Read failed", code: "EIO", stack: "Fixture stack", path: "/example.ts" };
  const error = normalizeRuntimeError(value, { kind: "rejection" });
  assert.equal(error.name, value.name);
  assert.equal(error.code, value.code);
  assert.equal(error.stack, value.stack);
  assert.equal(error.originalValue, value);
  assert.ok(error.message.includes(value.message));
  assert.ok(error.message.includes(value.path));
});
Then("circular rejection data retains useful fields without crashing", function () {
  const value = { message: "Circular fixture", operation: "import-directory", status: 409 };
  value.self = value;
  const error = normalizeRuntimeError(value, { kind: "rejection" });
  for (const expected of [value.message, value.operation, String(value.status)]) assert.ok(error.message.includes(expected));
  assert.match(error.message, /circular/i);
  assert.equal(error.originalValue, value);
  assert.equal(error.stack, "");
});
Then("hostile diagnostic accessors do not escape normalization", function () {
  const value = {};
  for (const key of ["name", "message", "stack", "code", "cause"]) {
    Object.defineProperty(value, key, { get() { throw new Error("Getter failure"); } });
  }
  const error = normalizeRuntimeError(value, { kind: "error", message: "Accessor fixture" });
  assert.ok(error instanceof Error);
  assert.ok(error.message.startsWith("Accessor fixture"));
  assert.equal(error.originalValue, value);
  assert.equal(error.stack, "");
  rememberErrorChain(value);
  assert.deepEqual(getErrorChain([value]), [{ name: "Error" }]);
});
Then("a resize observer error explains deferred notifications without inventing a stack", function () {
  const error = normalizeRuntimeError(null, { kind: "error", message: "ResizeObserver loop completed with undelivered notifications." });
  assert.equal(error.name, "ResizeObserverError");
  assert.match(error.message, /deferred resize notifications/);
  assert.match(error.message, /does not provide the callback's stack/);
  assert.equal(error.stack, "");
});
Then("remembered error chains restore codes omitted by serialization", function () {
  const cause = Object.assign(new Error("Restored cause"), { code: 23 });
  const error = Object.assign(new TypeError("Restored wrapper", { cause }), { code: "E_FIXTURE" });
  rememberErrorChain(error);
  assert.deepEqual(getErrorChain([{ name: error.name, message: error.message }, { name: cause.name, message: cause.message }]),
    [{ name: "TypeError", code: "E_FIXTURE" }, { name: "Error", code: 23 }]);
});
Then("conflicting remembered error codes remain unresolved", function () {
  rememberErrorChain({ name: "AmbiguousError", message: "Ambiguous fixture", code: "FIRST" });
  rememberErrorChain({ name: "AmbiguousError", message: "Ambiguous fixture", code: "SECOND" });
  assert.deepEqual(getErrorChain([{ name: "AmbiguousError", message: "Ambiguous fixture" }]), [{ name: "AmbiguousError" }]);
});
Then("explicit serialized error codes take precedence", function () {
  rememberErrorChain({ name: "PrecedenceError", message: "Precedence fixture", code: "REMEMBERED" });
  assert.deepEqual(getErrorChain([{ name: "PrecedenceError", message: "Precedence fixture", code: "EXPLICIT" }]), [{ name: "PrecedenceError", code: "EXPLICIT" }]);
});
Then("resolving the same error array retains its cached identity", function () {
  const serialized = [{ name: "CacheError", message: "Cache fixture" }];
  const first = getErrorChain(serialized);
  rememberErrorChain({ ...serialized[0], code: "LATE" });
  assert.equal(getErrorChain(serialized), first);
  assert.deepEqual(first, [{ name: "CacheError" }]);
});
Then("cyclic cause chains remain bounded", function () {
  const cyclic = { name: "CycleError", message: "Cycle fixture", code: "CYCLE" };
  cyclic.cause = cyclic;
  rememberErrorChain(cyclic);
  assert.deepEqual(getErrorChain([{ name: cyclic.name, message: cyclic.message }]), [{ name: "CycleError", code: "CYCLE" }]);
});
Then("long cause chains retain only the first fifty identities", function () {
  const entries = Array.from({ length: 60 }, (_, index) => ({ name: "DeepError", message: `Deep fixture ${index}`, code: index }));
  for (let index = 0; index < entries.length - 1; index++) entries[index].cause = entries[index + 1];
  rememberErrorChain(entries[0]);
  const serialized = entries.slice(0, 50).map(({ name, message }) => ({ name, message }));
  assert.deepEqual(getErrorChain(serialized), entries.slice(0, 50).map(({ name, code }) => ({ name, code })));
});
Then("an empty cause chain resolves to no identities", function () {
  rememberErrorChain(null);
  assert.deepEqual(getErrorChain([]), []);
});
Then("the invalid {string} error code is omitted", function (label) {
  const values = { empty: "", nan: NaN, infinity: Infinity, object: {}, false: false, null: null };
  assert.deepEqual(getErrorChain([{ name: "InvalidCodeError", message: "Invalid code fixture", code: values[label] }]), [{ name: "InvalidCodeError" }]);
});
