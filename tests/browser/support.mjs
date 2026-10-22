// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { After, AfterAll, Before, BeforeAll, Status, World, setDefaultTimeout, setWorldConstructor } from "@cucumber/cucumber";
import { chromium, expect } from "@playwright/test";
import { createServer as createHttpServer } from "node:http";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createServer as createViteServer } from "vite";

setDefaultTimeout(30_000);
let browser;
let productionServer;
let productionURL;
let developmentServer;
let developmentURL;
let developmentRoot;

class BrowserWorld extends World {}
setWorldConstructor(BrowserWorld);

async function startDevelopmentServer() {
  if (developmentServer) return;
  const directory = resolve("tmp/test/browser", `development-${process.pid}-${randomUUID().slice(0, 8)}`);
  const applicationRoot = resolve(directory, "app");
  developmentRoot = applicationRoot;
  await mkdir(directory, { recursive: true });
  await cp(resolve("src"), applicationRoot, { recursive: true });
  await Promise.all(["LICENSE", "LICENSE-ADDITIONAL-TERMS"].map(filename => cp(resolve(filename), resolve(directory, filename))));
  await cp(resolve("tests/fixtures"), resolve(applicationRoot, "test-fixtures"), { recursive: true });
  developmentServer = await createViteServer({
    configFile: resolve("vite.config.mjs"), configLoader: "native", root: applicationRoot,
    resolve: { alias: { $lib: resolve(applicationRoot, "lib") } },
    // Keep editor scenarios on their ordinary startup path while the local
    // development landing page previews the loading studies.
    define: { "import.meta.env.VITE_LOADING_GALLERY": JSON.stringify("false") },
    // The fixture is imported on demand; prebundle its dependencies before the
    // first scenario so Vite does not reload the page during keyboard checks.
    optimizeDeps: { entries: [resolve(applicationRoot, "index.html"), resolve(applicationRoot, "test-fixtures/ui-primitives.ts"),
      resolve(applicationRoot, "test-fixtures/repository-recovery.ts")] },
    cacheDir: resolve(directory, ".vite"),
    server: { host: "127.0.0.1", port: 0, strictPort: true, open: false },
  });
  await developmentServer.listen();
  developmentURL = `http://127.0.0.1:${developmentServer.httpServer.address().port}`;
  // Keep the OS-assigned port when a lifecycle scenario restarts this server.
  developmentServer.config.inlineConfig.server.port = developmentServer.httpServer.address().port;
}

BeforeAll(async function () {
  const html = await readFile(process.env.BROWSER_TEST_HTML ?? "dist/index.html");
  // Serve the production artifacts being tested, without rebuilding or reading
  // every optional package into memory before even one scenario can start.
  const packageFiles = new Set((await Promise.all(['formatters','languages','syntax','remotes','types'].map(async directory=>
    (await readdir(`dist/${directory}`)).map(name=>`${directory}/${name}`)))).flat());
  for (const directory of ['wllama','notices']) for (const name of await readdir(`dist/browser-models/${directory}`)) packageFiles.add(`browser-models/${directory}/${name}`);
  const iconTypes = {
    "favicon.svg": "image/svg+xml", "favicon.ico": "image/x-icon", "favicon.png": "image/png",
    "favicon.bmp": "image/bmp", "favicon.gif": "image/gif", "favicon.jpg": "image/jpeg",
    "favicon.ppm": "image/x-portable-pixmap", "favicon.tiff": "image/tiff", "apple-touch-icon.png": "image/png",
  };
  const icons = new Map(await Promise.all(Object.entries(iconTypes).map(async ([filename, type]) =>
    [`/${filename}`, { type, bytes: await readFile(`dist/${filename}`) }])));
  productionServer = createHttpServer(async (request, response) => {
    if (request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8",
        "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "credentialless" });
      response.end(html);
    } else if (packageFiles.has(request.url?.slice(1))) {
      try {
        const bytes=await readFile(`dist/${request.url.slice(1)}`);
        response.writeHead(200, { "content-type": request.url.endsWith(".wasm") ? "application/wasm" : request.url.endsWith(".js") ? "text/javascript" : "application/json" });response.end(bytes);
      } catch { response.writeHead(500).end('Could not read the built package.'); }
    } else if (icons.has(request.url)) {
      const icon = icons.get(request.url);
      response.writeHead(200, { "content-type": icon.type });
      response.end(icon.bytes);
    } else {
      response.writeHead(404).end("Only the standalone application and its explicit favicon files are available.");
    }
  });
  await new Promise((done, reject) => {
    productionServer.once("error", reject);
    productionServer.listen(0, "127.0.0.1", done);
  });
  productionURL = `http://127.0.0.1:${productionServer.address().port}`;
  try {
    browser = await chromium.launch({
      ignoreDefaultArgs: ["--hide-scrollbars"],
      ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}),
    });
  } catch (error) {
    productionServer.close();
    throw new Error("Cannot start Chromium. Use the matching Docker runner or explicitly set BROWSER_TEST_RUNTIME=local and BROWSER_EXECUTABLE_PATH.", { cause: error });
  }
});

Before(async function ({ pickle }) {
  const development = pickle.tags.some(tag => tag.name === "@development");
  const loadingGallery = pickle.tags.some(tag => tag.name === "@loading-gallery");
  if (development) await startDevelopmentServer();
  this.isDevelopment = development;
  this.baseURL = development ? developmentURL : productionURL;
  this.diagnostics = [];
  this.requests = [];
  this.expectedErrors = [];
  this.overlayFrames = [];
  this.toolbarInitializations = [];
  this.restartDevelopmentServer = () => developmentServer.restart();
  this.reloadDevelopmentPage = () => developmentServer.ws.send({ type: "full-reload", path: "*" });
  this.updateDevelopmentStyles = async token => {
    const path = resolve(developmentRoot, "app.css");
    await writeFile(path, `${await readFile(path, "utf8")}\n:root { --browser-hmr-generation: ${JSON.stringify(token)}; }\n`);
  };
  this.updateDevelopmentApp = async token => {
    const path = resolve(developmentRoot, "App.svelte");
    // Comments are compiled away and can produce only a Tailwind style update.
    await writeFile(path, (await readFile(path, "utf8"))
      .replace('<main aria-label=', `<main data-browser-hmr-generation="${token}" aria-label=`));
  };
  this.artifactDirectory = resolve("tmp/test/browser", `${pickle.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 75)}-${randomUUID().slice(0, 8)}`);
  await this.attach(JSON.stringify({ name: browser.browserType().name(), version: browser.version(), runtime: process.env.BROWSER_TEST_RUNTIME ?? "docker" }), "application/vnd.code.browser+json");
  this.context = await browser.newContext({
    viewport: { width: 1280, height: 900 }, locale: "en-US", timezoneId: "UTC",
    colorScheme: "light", reducedMotion: "reduce", deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await this.context.route("**/*", async route => {
    const url = route.request().url();
    this.requests.push({ url, type: route.request().resourceType() });
    if (url.startsWith(`${this.baseURL}/`) || /^(data|blob):/.test(url)) return route.continue();
    // Ordinary UI scenarios keep optional Google font menu previews offline.
    // Font scenarios register explicit routes to exercise downloads and caching.
    if (url.startsWith("https://fonts.googleapis.com/css2?") && new URL(url).searchParams.has("text")) return route.fulfill({ contentType: "text/css", body: "" });
    this.diagnostics.push({ type: "unexpected-network-request", url });
    await route.abort("blockedbyclient");
  });
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(12_000);
  this.observePage = page => {
    page.on("pageerror", error => this.diagnostics.push({ type: "pageerror", message: error.message, stack: error.stack }));
    page.on("console", message => {
      if (["error", "warning"].includes(message.type())) this.diagnostics.push({ type: `console-${message.type()}`, message: message.text() });
      if (message.text() === "[dev-toolbar] Initialized successfully") this.toolbarInitializations.push(page === this.page ? "primary" : "companion");
    });
    page.on("response", response => {
      if (response.status() >= 400) this.diagnostics.push({ type: "http-error", url: response.url(), status: response.status() });
    });
    page.on("websocket", socket => socket.on("framesent", ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload));
        if (frame.event === "visulima:vite-overlay:error") this.overlayFrames.push(frame.data);
      } catch { /* Websocket control frames need not contain JSON. */ }
    }));
  };
  this.observePage(this.page);
  await this.page.goto(`${this.baseURL}${loadingGallery ? "/?loaders=1" : ""}`, { waitUntil: "networkidle", timeout: 60_000 });
  await this.page.locator("#app main").waitFor({ state: "attached" });
  // Caught Worker errors do not necessarily emit Playwright pageerror. A
  // mounted shell alone must not hide a failed repository-storage startup.
  if (loadingGallery) {
    await expect(this.page.getByRole("main", { name: "Loading progress" })).toBeVisible();
    await expect(this.page.locator("#startup-status")).toBeVisible();
  } else {
    await expect(this.page.getByRole("status", { name: "Persistence status", exact: true }))
      .toHaveText("All changes saved", { timeout: 30_000 });
  }
  await expect(this.page.getByRole("alert")).toHaveCount(0);
});

After(async function ({ pickle, result }) {
  const errors = (this.diagnostics ?? []).filter(item => (item.type !== "console-warning"
    || item.message?.includes("[dev-toolbar] Only one instance is allowed."))
    && !(this.expectedErrors ?? []).some(message => item.message?.includes(message)));
  const failed = result?.status !== Status.PASSED || errors.length > 0;
  try {
    if (failed) {
      await mkdir(this.artifactDirectory, { recursive: true });
      const diagnostics = { scenario: pickle.name, status: result?.status, message: result?.message,
        diagnostics: this.diagnostics, requests: this.requests, expectedErrors: this.expectedErrors,
        image: process.env.BROWSER_TEST_IMAGE, node: process.version, browser: browser?.version(), url: this.page?.url() };
      await writeFile(`${this.artifactDirectory}/diagnostics.json`, `${JSON.stringify(diagnostics, null, 2)}\n`);
      await this.attach(JSON.stringify(diagnostics, null, 2), "application/json");
      if (this.page && !this.page.isClosed()) {
        const screenshot = await this.page.screenshot({ path: `${this.artifactDirectory}/screenshot.png`, fullPage: true, timeout: 5_000 });
        await this.attach(screenshot, "image/png");
      }
    }
  } finally {
    try { await this.context?.tracing.stop(failed ? { path: `${this.artifactDirectory}/trace.zip` } : {}); }
    finally { await this.context?.close(); }
  }
  if (errors.length) throw new Error(`Browser diagnostics failed: ${JSON.stringify(errors)}. Artifacts: ${this.artifactDirectory}`);
});

AfterAll(async function () {
  try { await browser?.close(); }
  finally {
    await developmentServer?.close();
    if (productionServer?.listening) await new Promise((done, reject) => productionServer.close(error => error ? reject(error) : done()));
  }
});
