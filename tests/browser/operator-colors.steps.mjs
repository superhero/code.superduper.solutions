// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

async function checkSamples(root, samples) {
  const results = await root.evaluate((element, samples) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const drawing = canvas.getContext("2d", { willReadFrequently: true });
    const color = value => {
      drawing.clearRect(0, 0, 1, 1);
      drawing.fillStyle = value;
      drawing.fillRect(0, 0, 1, 1);
      return [...drawing.getImageData(0, 0, 1, 1).data];
    };
    const probe = document.createElement("span");
    element.append(probe);
    let source = "";
    const spans = [];
    for (const line of element.querySelectorAll(".cm-content .cm-line")) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        const from = source.length;
        source += text.textContent;
        const parent = text.parentElement.closest(".cm-scope-parent, .cm-scope-global, .cm-scope-imported");
        spans.push({ from, to: source.length, color: color(getComputedStyle(text.parentElement).color),
          background: parent ? color(getComputedStyle(parent, "::before").backgroundColor) : undefined });
      }
      source += "\n";
    }
    try {
      return samples.map(({ expression, token, role }) => {
        const start = source.indexOf(expression);
        if (start < 0) throw new Error(`Expression was not rendered: ${expression}`);
        const offset = expression.indexOf(token);
        if (offset < 0) throw new Error(`Missing token ${token} in ${expression}`);
        const from = start + offset, to = from + token.length;
        const pill = role === "parent" || role === "global" || role === "imported";
        probe.style.color = `var(--syntax-${role === "local" ? "text" : pill && role !== "imported" ? `${role}Text` : role})`;
        const expected = color(getComputedStyle(probe).color);
        probe.style.color = `var(--syntax-${role === "imported" ? "importedBackground" : role})`;
        const matching = spans.filter(span => span.from < to && span.to > from);
        return { expression, token, role, expected,
          actual: matching.map(span => span.color),
          ...(pill ? { expectedBackground: color(getComputedStyle(probe).color),
            backgrounds: matching.map(span => span.background) } : {}) };
      });
    } finally { probe.remove(); }
  }, samples);
  const failures = results.filter(({ expected, actual, expectedBackground, backgrounds }) => !actual.length ||
    actual.some(color => color.some((channel, index) => channel !== expected[index])) ||
    expectedBackground && backgrounds.some(color => !color || color.some((channel, index) => channel !== expectedBackground[index])));
  assert.equal(failures.length, 0, `Every character must use its expected palette role: ${JSON.stringify(failures)}`);
}

Then("these operator samples use their palette roles:", async function (table) {
  this.operatorSamples = table.hashes();
  await checkSamples(this.page.locator(".cm-editor"), this.operatorSamples);
});

Then("both diff panes keep the operator sample colors", async function () {
  const diff = this.page.getByRole("region", { name: "File diff", exact: true });
  await expect(diff).toBeVisible();
  for (const side of ["a", "b"]) await checkSamples(diff.locator(`.cm-editor.cm-merge-${side}`), this.operatorSamples);
});

Then("the operator color follows live palette changes without reopening the document", async function () {
  const view = await this.page.locator(".cm-editor").elementHandle();
  await this.page.evaluate(() => {
    const style = document.createElement("style");
    style.id = "operator-palette-test";
    style.textContent = ':root[data-palette="bonfire"] { --palette-dark-13: #824c86; }';
    document.head.append(style);
  });
  await checkSamples(this.page.locator(".cm-editor"), this.operatorSamples);
  assert.equal(await view.evaluate(element => element === document.querySelector(".cm-editor")), true);
  await this.page.evaluate(() => document.getElementById("operator-palette-test").remove());
  await checkSamples(this.page.locator(".cm-editor"), this.operatorSamples);
});
