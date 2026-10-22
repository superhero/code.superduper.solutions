// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rolldown } from "rolldown";
import { compile } from "svelte/compiler";

const marker = "<!-- startup-preview -->";
const entry = "\0code-startup-preview";
const componentPaths = ["LoadingGallery", "EditorialLoader", "MechanicalLoader", "DraftingLoader"]
  .map(name => `lib/components/loading/${name}.svelte`);

/** Render the owned loader at build/request time, before browser JavaScript loads. */
export function startupPreview() {
  let root;
  let development = false;
  let hmr = false;
  let cached;

  async function renderPreview() {
    const inputs = await Promise.all([...componentPaths, "lib/startup-progress.ts"].map(async path => {
      const filename = resolve(root, path);
      return [filename, await readFile(filename, "utf8")];
    }));
    const fingerprint = createHash("sha256").update(JSON.stringify(inputs)).digest("hex");
    if (cached?.fingerprint === fingerprint) return cached.result;
    const result = render(inputs);
    cached = { fingerprint, result };
    try { return await result; }
    catch (error) { if (cached?.result === result) cached = undefined; throw error; }
  }

  async function render(inputs) {
    const sources = new Map(inputs);
    const styles = new Map();
    const galleryPath = resolve(root, componentPaths[0]);
    const bundle = await rolldown({
      input: entry,
      platform: "node",
      resolve: { conditionNames: [development ? "development" : "production", "node", "import", "default"] },
      plugins: [{
        name: "code-startup-svelte-renderer",
        resolveId(id) { if (id === entry) return id; },
        load(id) {
          if (id === entry) return `import { render } from "svelte/server";
            import Gallery from ${JSON.stringify(galleryPath)};
            export default render(Gallery).body;`;
          if (!sources.has(id)) return;
          let source = sources.get(id);
          if (!id.endsWith(".svelte")) return source;
          // Match vite-plugin-svelte's development CSS scoping so hydration keeps
          // the same elements/classes when its HMR compiler scopes every node.
          if (hmr) source = source.replace("</style>", " *{}\n</style>");
          // HMR also changes fragment anchors in shared compiler analysis; match
          // it on the server target so nested animation components hydrate in place.
          const compiled = compile(source, {
            filename: id, generate: "server", dev: development, hmr, css: "external",
          });
          if (compiled.css?.code) styles.set(id, compiled.css.code);
          return compiled.js.code;
        },
      }],
    });
    try {
      const generated = await bundle.generate({ format: "es" });
      if (generated.output.length !== 1 || generated.output[0].type !== "chunk") {
        throw new Error("Startup preview must render from one build-only module.");
      }
      // Keep renderer failures readable instead of putting the complete data URL
      // (and its embedded dependency source) into development/build stack traces.
      const source = Buffer.from(`${generated.output[0].code}\n//# sourceURL=code-startup-preview.generated.mjs`).toString("base64");
      const { default: body } = await import(`data:text/javascript;base64,${source}`);
      return { body, css: [...styles.values()].join("\n") };
    } finally { await bundle.close(); }
  }

  return {
    name: "code-startup-preview",
    configResolved(config) {
      root = config.root;
      development = !config.isProduction;
      hmr = development && config.command === "serve" && config.server?.hmr !== false;
    },
    transformIndexHtml: {
      order: "pre",
      async handler(html) {
        if (!html.includes(marker)) return html;
        const { body, css } = await renderPreview();
        return {
          html: html.replace(marker, body),
          tags: [{ tag: "style", attrs: { id: "startup-preview-style" }, children: css, injectTo: "head" }],
        };
      },
    },
  };
}
