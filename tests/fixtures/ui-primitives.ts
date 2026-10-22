// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { mount } from "svelte";
import Primitives from "./Primitives.svelte";

export function mountPrimitives(): void {
  const target = document.querySelector("#app main");
  if (!target) throw new Error("The isolated fixture requires the application mount.");
  mount(Primitives, { target });
}
