// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

import {installFormatterPackage} from "./formatter.helpers.mjs";
import {repositoryHistories} from "./repository-snapshot.helpers.mjs";

const editor = page => page.getByLabel("Code editor document", { exact: true });
const formatButton = page => page.getByRole("button", { name: "Format file", exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true }))
  .toHaveText("All changes saved");
const documentText = page => editor(page).locator(".cm-line").allTextContents().then(lines => lines.join("\n"));
const files = page => page.getByRole("tree", { name: "Repository files", exact: true });

const notebookFixture = {
  cells: [
    { cell_type: "code", id: "python-cell", execution_count: 7, metadata: { tags: ["keep"] },
      outputs: [{ output_type: "stream", name: "stdout", text: ["kept output\n"] }],
      source: ['value={"answer":42}\n'] },
    { cell_type: "markdown", id: "markdown-cell", metadata: { custom: "preserved" },
      source: ["#    Heading\n", "\n", "```javascript\n", "const value={answer:42}\n", "```\n"] },
    { cell_type: "raw", id: "raw-cell", metadata: {}, source: ["leave   raw alone\n"] },
  ],
  metadata: { kernelspec: { name: "python3", language: "python", display_name: "Python 3" },
    language_info: { name: "python" }, custom: { retained: true } },
  nbformat: 4, nbformat_minor: 5,
};

// These fixtures assert syntax-specific normalization without duplicating every
// provider's complete printing policy. Each provider is a separate scenario.
const fixtures = {
  TypeScript: { path: "sample.ts", source: "const value:{answer:number}={answer:42}",
    fragments: ["const value: { answer: number } = { answer: 42 };"] },
  JSON: { path: "sample.json", source: '{"answer":42,"items":[1,2]}',
    fragments: ['"answer": 42', '"items": ['] },
  Markdown: { path: "sample.md", source: "#    Title\n\n-   item\n",
    fragments: ["# Title\n", "- item\n"] },
  "Markdown with script": { path: "sample.md", source: "```javascript\nconst value={answer:42}\n```",
    fragments: ["```javascript\nconst value = { answer: 42 };\n```"] },
  TOML: { path: "sample.toml", source: 'answer=42\n[tool]\nname="browser"\n',
    fragments: ["answer = 42", 'name = "browser"'] },
  Dockerfile: { path: "Dockerfile", source: "FROM   alpine:3.20\nRUN    echo hello\n",
    fragments: ["FROM alpine:3.20", "RUN echo hello"] },
  Python: { path: "sample.py", source: 'value={"answer":42}\n',
    fragments: ['value = {"answer": 42}'] },
  PHP: { path: "sample.php", source: '<?php $value=["answer"=>42];',
    fragments: ['$value = [', '=> 42'] },
  HTML: { path: "sample.html", source: '<div   class="sample"><span>hello</span></div>',
    fragments: ['<div class="sample">', "<span>hello</span>"] },
  CSS: { path: "sample.css", source: "a{color:red;margin:0}",
    fragments: ["a {", "  color: red;", "  margin: 0;"] },
  SCSS: { path: "sample.scss", source: "$color:red;a{color:$color}",
    fragments: ["$color: red;", "  color: $color;"] },
  Less: { path: "sample.less", source: "@color:red;a{color:@color}",
    fragments: ["@color: red;", "  color: @color;"] },
  YAML: { path: "sample.yaml", source: "answer:    42\nitems: [one,two]\n",
    fragments: ["answer: 42", "items: [one, two]"] },
  GraphQL: { path: "sample.graphql", source: "query Example{viewer{id name}}",
    fragments: ["query Example {", "  viewer {", "    id\n", "    name\n"] },
  Vue: { path: "sample.vue", source: '<template><div   class="sample">{{message}}</div></template><script>const message="hello"</script>',
    fragments: ['<div class="sample">{{ message }}</div>', 'const message = "hello";'] },
  Angular: { path: "sample.component.html", source: '<div   *ngIf="ready">{{name}}</div>',
    fragments: ['<div *ngIf="ready">{{ name }}</div>'] },
  Svelte: { path: "sample.svelte", source: '<script>let count=0;</script><button onclick={()=>count++}>{count}</button>',
    fragments: ["let count = 0;", "onclick={() => count++}"] },
  "C#": { path: "sample.cs", source: "class Example{public int Add(int a,int b){return a+b;}}",
    fragments: ["int a, int b", "return a + b;"] },
  "Visual Basic": { path: "sample.vb", source: "Module Example\nSub Main()\nDim value=1+2\nEnd Sub\nEnd Module",
    fragments: ["  Sub Main()", "    Dim value = 1 + 2", "  End Sub"] },
  Jupyter: { path: "sample.ipynb", source: JSON.stringify(notebookFixture), fragments: [] },
  "Invalid notebook": { path: "sample.ipynb", source: "{ this is invalid notebook JSON }", fragments: [] },
  XML: { path: "sample.xml", source: '<root><item a = "b"/></root>',
    fragments: ['a="b"'] },
};

async function chooseView(page, name) {
  await page.getByRole("button", { name: "Page", exact: true }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}
async function installSupport(page, name) {
  await chooseView(page, "Settings");
  const scope = page.getByRole("button", { name: "Settings scope", exact: true });
  if (await scope.getAttribute("data-value") !== "global") {
    await scope.click(); await page.getByRole("menuitemradio", { name: "Global defaults", exact: true }).click();
  }
  await installFormatterPackage(page,name);
  await chooseView(page, "Editor");
  await saved(page);
}
Given("JavaScript formatting support is installed", async function () {
  await installSupport(this.page, "JavaScript / TypeScript");
});
const providers = { TypeScript: "JavaScript / TypeScript", JSON: "JSON", Markdown: "Markdown",
  "Markdown with script": "Markdown", TOML: "TOML", Dockerfile: "Dockerfile", Python: "Ruff", PHP: "Mago",
  HTML: "HTML / Vue / Angular", CSS: "Stylesheets", SCSS: "Stylesheets", Less: "Stylesheets",
  YAML: "YAML", GraphQL: "GraphQL", Vue: "HTML / Vue / Angular", Angular: "HTML / Vue / Angular",
  Svelte: "Svelte", XML: "XML", "C#": "Roslyn", "Visual Basic": "Roslyn", Jupyter: "Jupyter", "Invalid notebook": "Jupyter" };

async function historyIds(page, label) {
  await saved(page);
  const histories = await repositoryHistories(page);
  return label === "Staged changes" ? histories.edits : histories.commits;
}

async function waitForFormatting(page) {
  await expect(formatButton(page)).toHaveAttribute("aria-busy", "false", { timeout: 25_000 });
  await saved(page);
}

Given("the unformatted {string} document fixture is imported", async function (language) {
  await installSupport(this.page, providers[language]);
  const fixture = fixtures[language];
  assert.ok(fixture, `Unknown formatting fixture: ${language}`);
  const directory = join(this.artifactDirectory, "formatting-project");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, fixture.path), fixture.source);
  if (language === "Svelte") await writeFile(join(directory, ".prettierrc"), JSON.stringify({
    plugins: ["prettier-plugin-svelte"], overrides: [{ files: "*.svelte", options: { parser: "svelte" } }]
  }));
  // A second file gives the stale-tab scenario a real existing destination.
  await writeFile(join(directory, "other.ts"), "const other = 7;\n");
  await this.page.getByLabel("Import directory", { exact: true }).setInputFiles(directory);
  await saved(this.page);
  await files(this.page).getByRole("treeitem", { name: fixture.path, exact: true }).locator(":scope > .tree-row").click();
  await expect.poll(() => documentText(this.page)).toBe(fixture.source);
  this.filePath = fixture.path;
  this.recordedHistories = {
    edits: await historyIds(this.page, "Staged changes"),
    commits: await historyIds(this.page, "Commit history"),
  };
});

Given("another formatting document {string} is available", async function (path) {
  await files(this.page).getByRole("treeitem", { name: path, exact: true }).locator(":scope > .tree-row").click();
  await expect.poll(() => documentText(this.page)).toBe("const other = 7;\n");
  await saved(this.page);
});

When("I format the current document", async function () {
  await saved(this.page);
  await expect(formatButton(this.page)).toBeEnabled();
  await formatButton(this.page).click();
  await waitForFormatting(this.page);
});

When("I start formatting the current document", async function () {
  await formatButton(this.page).click();
  await expect.poll(() => this.page.evaluate(() => typeof globalThis.__releaseFormatting)).toBe("function");
  await expect(formatButton(this.page)).toHaveAttribute("aria-busy", "true");
});

Then("the format action is an enabled icon in the editor toolbar", async function () {
  const action = formatButton(this.page);
  await expect(action).toBeEnabled();
  await expect(action).toHaveAttribute("aria-busy", "false");
  assert.equal(await action.evaluate(element => Boolean(element.closest(".editor-toolbar"))), true);
  assert.equal(await action.evaluate(element => [...element.childNodes]
    .filter(node => node.nodeType === Node.TEXT_NODE).every(node => !node.textContent.trim())), true,
  "The action uses its accessible name rather than a visible text label");
});

Then("the format action is unavailable", async function () {
  await expect(formatButton(this.page)).toBeDisabled();
});

Then("the document matches the {string} formatting fixture", async function (language) {
  const fixture = fixtures[language];
  await saved(this.page);
  const actual = await documentText(this.page);
  assert.notEqual(actual, fixture.source, `${language} must apply meaningful syntax formatting`);
  for (const fragment of fixture.fragments) assert.ok(actual.includes(fragment),
    `${language} output must contain ${JSON.stringify(fragment)}; received ${JSON.stringify(actual)}`);
  await expect(this.page.getByRole("alert")).toHaveCount(0);
  const current = await historyIds(this.page, "Staged changes");
  assert.equal(current.length, this.recordedHistories.edits.length + 1, "Formatting creates exactly one private Git edit");
});

Then("the document still matches the unformatted {string} fixture", async function (language) {
  await saved(this.page);
  await expect.poll(() => documentText(this.page)).toBe(fixtures[language].source);
});

Given("the next formatting request is held at the formatter worker", async function () {
  await saved(this.page);
  await this.page.evaluate(() => {
    const send = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, ...options) {
      // The dedicated code-formatting worker receives { id, request }, while
      // repository requests use { id, method, args } and must keep running.
      if (typeof message?.request?.text !== "string" || typeof message?.request?.path !== "string") {
        return send.call(this, message, ...options);
      }
      Worker.prototype.postMessage = send;
      globalThis.__releaseFormatting = () => {
        delete globalThis.__releaseFormatting;
        send.call(this, message, ...options);
      };
    };
  });
});

Then("the pending formatter keeps the code document editable", async function () {
  await expect(formatButton(this.page)).toHaveAttribute("aria-busy", "true");
  await expect(formatButton(this.page)).toBeDisabled();
  await expect(editor(this.page)).toHaveAttribute("aria-readonly", "false");
  await expect(this.page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
});

When("I append {string} to the formatting document", async function (source) {
  await editor(this.page).click();
  await this.page.keyboard.press("Control+End");
  await this.page.keyboard.insertText(source.replaceAll("\\n", "\n"));
  await saved(this.page);
});

When("the held formatting request is released", async function () {
  await this.page.evaluate(() => {
    if (!globalThis.__releaseFormatting) throw new Error("A formatting request must be held before releasing it");
    globalThis.__releaseFormatting();
  });
  await waitForFormatting(this.page);
});

Then("no formatting error is displayed", async function () {
  await expect(this.page.getByRole("alert")).toHaveCount(0);
});

Then("the formatter reports an actionable error", async function () {
  const error = this.page.getByRole("alert");
  await expect(error).toContainText("Formatting could not be completed");
  await expect(error).toContainText(/expected|syntax|parse|expression/i);
  await expect(editor(this.page)).toHaveAttribute("aria-readonly", "false");
  await expect(formatButton(this.page)).toBeEnabled();
});

Given("Jupyter cell formatters are installed", async function () {
  await installSupport(this.page, "Ruff");
  await installSupport(this.page, "Markdown");
  await installSupport(this.page, "JavaScript / TypeScript");
});
Then("the notebook cells are formatted while its metadata and outputs are preserved", async function () {
  await saved(this.page);
  const actual = JSON.parse(await documentText(this.page));
  assert.equal(actual.cells[0].source.join("").trimEnd(), 'value = {"answer": 42}');
  const markdown = actual.cells[1].source.join("");
  assert.ok(markdown.startsWith("# Heading\n"));
  assert.ok(markdown.includes("const value = { answer: 42 };"));
  const expected = structuredClone(notebookFixture);
  expected.cells[0].source = actual.cells[0].source;
  expected.cells[1].source = actual.cells[1].source;
  assert.deepEqual(actual, expected, "Only Python and Markdown cell source may change");
  const edits = await historyIds(this.page, "Staged changes");
  assert.equal(edits.length, this.recordedHistories.edits.length + 1, "All cells are formatted in one Git edit");
  await expect(this.page.getByRole("alert")).toHaveCount(0);
});
Then("no notebook cell formatter is downloaded automatically", async function () {
  const downloads = this.requests.filter(item => item.url.includes("/formatters/"));
  assert.equal(downloads.length, 1);
  assert.ok(downloads[0].url.includes("dprint-jupyter-"));
});
