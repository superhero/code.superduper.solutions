// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import tailwindcss from "@tailwindcss/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import errorOverlay from "@visulima/vite-overlay";
import { devToolbar } from "@visulima/dev-toolbar/vite";
import { pail } from "@visulima/pail";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { collectInlineWorkerLicenses, embedLicenseNotices, licenseInventoryFile } from "./build/license-notices.mjs";
import { formatterPackages, formatterCatalog } from "./build/formatter-packages.mjs";
import { syntaxPackages, syntaxCatalog } from "./build/syntax-packages.mjs";
import { remotePackages } from "./build/remote-packages.mjs";
import { languagePackages } from "./build/language-packages.mjs";
import { typePackages } from "./build/type-packages.mjs";
import { startupPreview } from "./build/startup-preview.mjs";
import { modelRuntimes } from "./build/model-runtimes.mjs";
import { browserModels } from "./build/browser-models.mjs";
import { speechRuntime } from "./build/speech-runtime.mjs";

const workerLicenses = [];

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless"
};

const toolbarPlugins = devToolbar({
  placement: "bottom-center",
  apps: { performance: true, timeline: true, settings: false },
  injectSource: { enabled: false }
});
const toolbar = toolbarPlugins.find(plugin => plugin.name === "@visulima/dev-toolbar");
if (typeof toolbar?.configureServer !== "function") {
  throw new Error("Visulima toolbar server hook changed; review the initialization adapter.");
}
const configureToolbar = toolbar.configureServer;
toolbar.configureServer = function (server) {
  const on = server.ws.on;
  let omitted = 0;
  server.ws.on = function (event, listener, ...args) {
    // The client already starts on document load. This redundant broadcast
    // races that startup and resets existing toolbars whenever another tab opens.
    const source = event === "connection" ? Function.prototype.toString.call(listener).replace(/\s/g, "") : "";
    if (/^\(\)=>\{[\w$]+\.ws\.send\(\{event:"dev-toolbar:init",type:"custom"\}\)\}$/.test(source)) {
      omitted += 1;
      return this;
    }
    return on.call(this, event, listener, ...args);
  };
  try {
    const result = configureToolbar.call(this, server);
    if (omitted !== 1) throw new Error("Visulima toolbar connection hook changed; review the initialization adapter.");
    return result;
  } finally { server.ws.on = on; }
};

const overlay = errorOverlay({
  framework: "svelte",
  // Pail sends errors explicitly. Never intercept Vite's transport errors.
  forwardedConsoleMethods: ["warn"],
  showBalloonButton: false,
  overlay: {
    customCSS: readFileSync(new URL("./src/dev/error-overlay.css", import.meta.url), "utf8")
  }
});
const injectOverlay = overlay.transformIndexHtml;
overlay.transformIndexHtml = async function (...args) {
  const result = await injectOverlay.apply(this, args);
  const runtime = result.tags?.find(tag => tag.tag === "script" && tag.attrs?.type === "module"
    && typeof tag.children === "string" && tag.children.includes("async function sendError("));
  if (!runtime) throw new Error("Visulima runtime injection changed; review the browser error normalization hook.");
  // Module dependencies run before its body registers the error listeners.
  runtime.children = `import "/dev/error-chain.ts";\n${runtime.children}`;
  return result;
};
const configureOverlay = overlay.configureServer;
overlay.configureServer = function (server) {
  const on = server.ws.on;
  server.ws.on = function (event, listener) {
    if (event !== "visulima:vite-overlay:error") return on.call(this, event, listener);
    return on.call(this, event, (data, client) => {
      if (data && !data.cause && !data.stack && !(data.file && data.line > 0)) {
        // Visulima prepends the full message to its stack parser. With no trace,
        // multiline diagnostic prose can become a fictitious source location.
        // There is no source to resolve: deliver the same overlay shape directly.
        pail.error(`[client] ${data.name}: ${data.message}`);
        client.send({ type: "error", err: { errorType: "client", rootPath: server.config.root,
          errors: [{ name: data.name, message: data.message, stack: "", originalStack: "",
            originalFilePath: data.file || "", originalFileLine: 0, originalFileColumn: 0,
            originalSnippet: "", compiledFilePath: "", compiledLine: 0, compiledColumn: 0,
            compiledSnippet: "", fixPrompt: "" }] } });
        return;
      }
      return listener(data, client);
    });
  };
  try { return configureOverlay.call(this, server); }
  finally { server.ws.on = on; }
};

export default defineConfig({
  root: "src",
  base: "./",
  // Visulima handles runtime errors; Vite's own forwarding can report failed
  // transmissions back through console.error and create a transport loop.
  server: { host: "127.0.0.1", port: 5175, strictPort: true, forwardConsole: false, headers: isolationHeaders },
  preview: { host: "127.0.0.1", port: 4175, strictPort: true, headers: isolationHeaders },
  resolve: {
    alias: {
      $lib: fileURLToPath(new URL("./src/lib", import.meta.url))
    }
  },
  // Discover the small worker adapter before the first manual format request.
  optimizeDeps: { include: ["@dprint/formatter"] },
  worker: {
    format: "es",
    // Lazy formatter imports must stay inside the embedded worker, including Wasm.
    rolldownOptions: { output: { codeSplitting: false } },
    plugins: () => [syntaxCatalog(), formatterCatalog(), collectInlineWorkerLicenses(workerLicenses)]
  },
  plugins: [
    browserModels(),
    modelRuntimes(),
    speechRuntime(),
    formatterPackages(),
    languagePackages(),
    typePackages(),
    syntaxPackages(),
    remotePackages(),
    startupPreview(),
    tailwindcss(),
    svelte(),
    {
      name: "code-error-source-lookup",
      apply: "serve",
      configureServer(server) {
        const getModuleByUrl = server.moduleGraph.getModuleByUrl;
        server.moduleGraph.getModuleByUrl = function (url, ...args) {
          // Visulima derives an empty candidate from inline-page paths like '/'.
          // It means no source module, not a second error from Vite's resolver.
          return url === "" ? Promise.resolve(undefined) : getModuleByUrl.call(this, url, ...args);
        };
      },
    },
    overlay,
    toolbarPlugins,
    viteSingleFile({ deleteInlinedFiles: false }),
    embedLicenseNotices(workerLicenses)
  ],
  build: {
    target: "es2024",
    license: { fileName: licenseInventoryFile },
    outDir: "../dist",
    emptyOutDir: true
  }
});
