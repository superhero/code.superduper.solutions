// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { mount } from "svelte";
import ResourceChart from "$lib/components/resources/ResourceChart.svelte";
import type { ResourceSample } from "$lib/resources/browser.ts";

/** Synthetic browser observations for the renderer only; no repository or history writes. */
export function mountResourceHistory() {
  const target = document.createElement("section");
  target.setAttribute("aria-label", "Resource history fixture");
  target.style.cssText = "position:fixed;z-index:50;left:20px;top:20px;width:900px;max-width:calc(100vw - 40px);padding:22px;box-sizing:border-box;background:var(--color-surface);color:var(--color-foreground);";
  document.body.append(target);
  const end = Date.now();
  const samples: ResourceSample[] = Array.from({ length: 1024 }, (_, index) => ({
    at: end - (1023 - index) * 2000,
    heap: { used: (64 + 12 * Math.sin(index / 11)) * 1024 ** 2, allocated: 128 * 1024 ** 2, limit: 1024 ** 3, error: null },
    storage: { usage: (12 + index / 1024) * 1024 ** 2, quota: 1024 ** 3, persisted: false, estimateError: null, persistenceError: null },
    processing: { longTasks: index % 17 === 0 ? 1 : 0, longTaskTime: index % 17 === 0 ? 80 : 0,
      blockingTime: index % 17 === 0 ? 30 : 0, longestTask: index % 17 === 0 ? 80 : 0, interval: 2000, error: null },
  }));
  mount(ResourceChart, { target, props: { samples } });
}
