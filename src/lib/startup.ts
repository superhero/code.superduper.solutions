// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.

import { hydrate, mount, unmount } from "svelte";
import { get } from "svelte/store";
import LoadingGallery from "./components/loading/LoadingGallery.svelte";
import { endStartupProgress, resetStartupProgress, startupProgress } from "./startup-progress.ts";

let gallery: ReturnType<typeof mount> | undefined;
let generation = 0;
let preview = false;
let fade: Animation | undefined;

export function previewStartup(value: boolean): void { preview = value; }

/** Upgrade the pre-JavaScript placeholder, including after a development remount. */
export function beginStartup(): void {
  generation++;
  fade?.cancel(); fade = undefined;
  resetStartupProgress();
  let loader = document.getElementById("startup-status");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "startup-status";
    document.body.prepend(loader);
  }
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-label", "Loading code editor");
  loader.setAttribute("aria-live", "off");
  loader.style.removeProperty("pointer-events");
  if (!gallery) {
    if (loader.dataset.prerendered === "true") {
      // Attach progress to the already animated DOM without restarting it.
      gallery = hydrate(LoadingGallery, { target: loader });
      delete loader.dataset.prerendered;
      // Client component styles are loaded now; don't retain stale rules through HMR.
      document.getElementById("startup-preview-style")?.remove();
    } else {
      loader.replaceChildren();
      gallery = mount(LoadingGallery, { target: loader });
    }
  }
  const app = document.getElementById("app");
  app?.setAttribute("inert", "");
  app?.setAttribute("aria-busy", "true");
}

/** Reveal the workspace after ready panes have finished their sequential fades. */
export function finishStartup(failed = false, onReveal?: () => void): void {
  const hasFailure = failed || get(startupProgress).stages.some(stage => stage.status === "error");
  endStartupProgress(hasFailure);
  // The temporary design preview runs real startup but keeps its finished screen.
  if (preview && !hasFailure) return;
  const currentGeneration = generation;
  void (async () => {
    if (!hasFailure) await gallery?.waitUntilPresented();
    if (currentGeneration !== generation) return;
    const app = document.getElementById("app");
    app?.removeAttribute("inert");
    app?.removeAttribute("aria-busy");
    onReveal?.();
    const loader = document.getElementById("startup-status");
    if (!loader) return;
    const remove = () => {
      if (currentGeneration !== generation) return;
      if (gallery) { void unmount(gallery); gallery = undefined; }
      loader.remove();
    };
    loader.style.pointerEvents = "none";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      remove();
      return;
    }
    fade = loader.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 180, easing: "ease-out", fill: "forwards",
    });
    void fade.finished.then(remove, remove);
  })();
}

/** A disposable first-paint cache; persisted editor settings remain authoritative. */
export function rememberAppearance(theme: string, palette: string, interfaceFont = "google:Geomini", interfaceSize = "medium"): void {
  try { localStorage.setItem("code.appearance.v1", JSON.stringify({ version: 1, theme, palette, interfaceFont, interfaceSize })); }
  catch { /* Browsers may disallow this optional cache independently of IndexedDB. */ }
}

import.meta.hot?.dispose(() => {
  generation++;
  fade?.cancel();
  if (gallery) { void unmount(gallery); gallery = undefined; }
});
