// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { logger } from "$lib/logger.ts";

export function throwRuntimeError(): void {
  window.setTimeout(() => {
    throw new Error("Fixture native runtime failure.");
  }, 0);
}

export function logTestError(): void {
  const cause = Object.assign(new TypeError("Fixture underlying failure."), { code: "E_FIXTURE_CAUSE" });
  logger.error(new Error("Fixture logged application failure.", { cause }));
}
