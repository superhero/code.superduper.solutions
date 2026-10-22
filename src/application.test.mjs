// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { startApplication } from "./bootstrap.ts";

function setup(world, target) {
  world.target = target;
  world.component = { name: "Fixture component" };
  world.mountResult = { destroy() {} };
  world.mountCalls = [];
  world.documentRef = {
    querySelector(selector) {
      assert.equal(selector, "#app");
      return target;
    },
  };
}

Given("a document with an application mount target", function () { setup(this, {}); });
Given("a document without an application mount target", function () { setup(this, null); });
Given("a component that fails to mount", function () {
  this.mountFailure = new Error("Component mounting failed", { cause: new TypeError("Invalid component") });
});

When("the application starts", function () {
  try {
    this.result = startApplication(this.documentRef, this.component, (component, options) => {
      this.mountCalls.push({ component, options });
      if (this.mountFailure) throw this.mountFailure;
      return this.mountResult;
    });
  } catch (error) { this.startupError = error; }
});

Then("the supplied component is mounted exactly once into the target", function () {
  assert.equal(this.startupError, undefined);
  assert.equal(this.mountCalls.length, 1);
  assert.equal(this.mountCalls[0].component, this.component);
  assert.equal(this.mountCalls[0].options.target, this.target);
});
Then("startup returns the original mounting result", function () {
  assert.equal(this.startupError, undefined);
  assert.equal(this.result, this.mountResult);
});
Then("startup fails with {string} before mounting", function (message) {
  assert.equal(this.startupError?.message, message);
  assert.deepEqual(this.mountCalls, []);
  assert.equal(this.result, undefined);
});
Then("startup propagates the original mounting failure", function () {
  assert.equal(this.mountCalls.length, 1);
  assert.equal(this.startupError, this.mountFailure);
  assert.equal(this.startupError.cause, this.mountFailure.cause);
  assert.equal(this.result, undefined);
});
