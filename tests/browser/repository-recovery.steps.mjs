// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then, When } from "@cucumber/cucumber";

When("a repository edit is interrupted at {string} and the storage service reopens", async function (stage) {
  this.recoveryStage = stage;
  this.recovery = await this.page.evaluate(async stage => {
    const fixture = await import("/test-fixtures/repository-recovery.ts");
    return fixture.recoverInterruptedEdit(stage);
  }, stage);
});

Then("recovery restores the accepted file and exactly one Git history commit", function () {
  const result = this.recovery;
  assert.equal(result.injected, true, `The ${this.recoveryStage} checkpoint did not run`);
  assert.match(result.error, new RegExp(`Injected interruption at ${this.recoveryStage}`));
  assert.equal(result.working, "after");
  assert.equal(result.historical, "after");
  assert.equal(result.revisionChanged, true);
  assert.equal(result.recoveredOids.length, result.beforeOids.length + 1);
  assert.deepEqual(result.recoveredOids.slice(1), result.beforeOids);
  assert.match(result.recoveredOids[0], /^[a-f0-9]{40}$/);
  assert.deepEqual(result.repeatedOids, result.recoveredOids, "Repeated recovery must not manufacture another commit");
});

Then("recovery retains undo and redo without changing source commits", function () {
  assert.equal(this.recovery.undoText, "before");
  assert.equal(this.recovery.redoText, "after");
  assert.equal(this.recovery.sourceHeadAfter, this.recovery.sourceHeadBefore);
  assert.deepEqual(this.recovery.sourceCommitsAfter, this.recovery.sourceCommitsBefore);
});
