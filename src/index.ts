// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { mount, unmount } from "svelte";
import App from "./App.svelte";
import { startApplication } from "./bootstrap.ts";
import { logger } from "./lib/logger.ts";
import { finishStartup, previewStartup } from "./lib/startup.ts";

try {
  if (import.meta.env.DEV) {
    document.documentElement.dataset.developerToolbar =
      String(new URLSearchParams(location.search).get("dev-tools") === "1");
    const { initErrorOverlayContext } = await import("./dev/error-overlay-context.ts");
    initErrorOverlayContext();
  }

  const parameters = new URLSearchParams(location.search);
  previewStartup(import.meta.env.DEV && parameters.get("editor") !== "1"
    && (import.meta.env.VITE_LOADING_GALLERY === "true" || parameters.get("loaders") === "1"));
  startApplication(document, App, (component, options) => mount(component, options));

  if (import.meta.env.DEV) {
    const { initToolbarTheme } = await import("./dev/toolbar-theme.ts");
    initToolbarTheme();
    const { default: DevTooltips } = await import("./dev/DevTooltips.svelte");
    const tooltips = mount(DevTooltips, { target: document.body });
    import.meta.hot?.dispose(() => { void unmount(tooltips); });
  }
} catch (error) {
  logger.error(error);
  const message = document.createElement("pre");
  message.setAttribute("role", "alert");
  message.textContent = error instanceof Error
    ? `The editor could not start.\n${error.stack || error.message}`
    : `The editor could not start.\n${String(error)}`;
  document.body.append(message);
  finishStartup(true);
}
