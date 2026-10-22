// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { repositorySnapshot, repositoryHistories } from "./repository-snapshot.helpers.mjs";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { openNavigationMenu, selectPage } from "./navigation.helpers.mjs";
import { createSourceCommitFixture } from "./editor.steps.mjs";

const changeGraph = page => page.getByRole("list", { name: "Staged changes", exact: true, includeHidden: true });
const editor = page => page.getByLabel("Code editor document", { exact: true });
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
async function expectLineSummary(change, path, text) {
  await expect.poll(async () => {
    const value = (await change.textContent()).trim();
    return value.startsWith(`${path}:`) ? value.slice(path.length + 1).trim() : value;
  }).toBe(text);
}
When('I create separate graph test edits for {string}',async function(value){
  await editor(this.page).click();await this.page.keyboard.press('Control+End');
  for(const character of value){
    await this.page.keyboard.press('ArrowLeft');await this.page.keyboard.press('Control+End');
    await this.page.keyboard.insertText(character);
  }
  await saved(this.page);
});

async function graphSnapshot(page) {
  await saved(page);
  if (!await page.locator("[data-history-panel]").count()) await selectPage(page,"History");
  const graph = changeGraph(page);
  await expect(graph).toBeAttached();
  // Layout fixtures explicitly expand each independent branch. Defaults and
  // branch isolation are checked separately below.
  await expandGraphBranches(graph);
  return graph.evaluate(element => ({
    lanes: Number(element.dataset.lanes),
    anchors: Array.from(element.querySelectorAll("li[data-graph-anchor]"), row => row.dataset.graphAnchor),
    revisions: Array.from(element.querySelectorAll("li[data-oid]"), row => ({
      oid: row.dataset.oid,
      parents: row.dataset.parents?.split(" ").filter(Boolean) ?? [],
      graphParents: row.dataset.graphParents?.split(" ").filter(Boolean) ?? [],
      current: row.getAttribute("aria-current") === "true",
      nodes: row.querySelectorAll(".commit-node").length,
      changes: Array.from(row.querySelectorAll(".line-change"), change => ({
        path: change.dataset.path,
        text: change.textContent.trim(),
      })),
      segments: Array.from(row.querySelectorAll("svg path[data-kind]"), path => ({
        kind: path.dataset.kind,
        from: Number(path.dataset.from),
        to: Number(path.dataset.to),
      })),
    })),
  }));
}

const sourceGraph = page => page.getByRole("list", { name: "Commit history", exact: true, includeHidden: true });
const sourceSnapshot = async page => {
  const snapshot=await repositorySnapshot(page);
  return snapshot.commits.map(version=>({oid:version.oid,current:version.oid===snapshot.head?"true":null,message:version.message}));
};
async function expandGraphBranches(graph) {
  const opened = new Set();
  while (await graph.locator('[data-branch-id][aria-expanded="false"]').count()) {
    const button=graph.locator('[data-branch-id][aria-expanded="false"]').first();
    const id=await button.getAttribute('data-branch-id');
    assert.ok(!opened.has(id),'A branch must expand before processing another');
    const target=graph.locator(`[data-branch-id="${id}"]`);
    opened.add(id);await expect(target).toBeEnabled();
    await target.evaluate(element=>element.click());
    await expect(target).toHaveAttribute('aria-expanded','true');
  }
}
async function expandSourceBranches(page) {
  await expandGraphBranches(sourceGraph(page));
}


function selectableChange(world, name) {
  assert.ok(name in world.selectableChanges);
  return changeGraph(world.page).locator(`li[data-oid="${world.selectableChanges[name]}"]`);
}

Given("selectable earlier and latest change revisions are recorded", async function () {
  const { revisions } = await graphSnapshot(this.page);
  const current = revisions.find(revision => revision.current);
  const parent = revisions.find(revision => revision.oid === current.parents[0]);
  assert.ok(parent?.parents[0], "The earlier target skips two actual saved edit revisions");
  this.selectableChanges = { latest: current.oid, earlier: parent.parents[0] };
  this.sourceBeforeSelection = await sourceSnapshot(this.page);
});

When("I click the checkpoint area of the recorded {string} change", async function (name) {
  await saved(this.page);
  const row = selectableChange(this, name);
  const button = row.locator(".change-load");
  await expect(button).toHaveAccessibleName(`Load change ${this.selectableChanges[name].slice(0, 8)}`);
  await expect(button).toBeEnabled();
  const bounds = await button.boundingBox();
  assert.ok(bounds);
  const position = { x: bounds.width - 3, y: bounds.height / 2 };
  await button.hover({ position });
  const appearance = await row.evaluate(element => {
    const rowBounds = element.getBoundingClientRect();
    const buttonBounds = element.querySelector(".change-load").getBoundingClientRect();
    const probe = document.createElement("span");
    probe.style.backgroundColor = "color-mix(in srgb, var(--color-surface) 50%, transparent)";
    element.append(probe);
    const expectedColor = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const start = rowBounds.left + 4 + parseFloat(getComputedStyle(element).getPropertyValue("--branch-tag-width"));
    return { actualColor: getComputedStyle(element,"::before").backgroundColor, expectedColor,
      coversRow: Math.abs(buttonBounds.left - start) < 1 && Math.abs(buttonBounds.right - (rowBounds.right - 4)) < 1
        && Math.abs(buttonBounds.top - rowBounds.top) < 1 && Math.abs(buttonBounds.bottom - rowBounds.bottom) < 1 };
  });
  assert.equal(appearance.coversRow, true, "The checkpoint area covers the tree, message and empty space while excluding branch tags");
  assert.equal(appearance.actualColor, appearance.expectedColor);
  await button.click({ position });
  await saved(this.page);
});

When("I activate the recorded {string} change with {string}", async function (name, key) {
  assert.ok(["Enter", "Space"].includes(key));
  await saved(this.page);
  const button = selectableChange(this, name).locator(".change-load");
  await button.focus();
  await expect(button).toBeFocused();
  await button.press(key);
  await saved(this.page);
});

Then("the recorded {string} change is current without leaving History", async function (name) {
  await saved(this.page);
  await graphSnapshot(this.page);
  await expect(this.page.getByRole("region", { name: "History", exact: true })).toBeVisible();
  await expect(this.page.getByRole("button", { name: "Page", exact: true })).toHaveAttribute("data-value", "editor");
  await expect(changeGraph(this.page).locator('li[aria-current="true"]')).toHaveAttribute("data-oid", this.selectableChanges[name]);
  await expect(changeGraph(this.page).locator('li[aria-current="true"] > .change-load')).toBeFocused();
  for (const revision of Object.keys(this.selectableChanges)) await expect(selectableChange(this, revision)).toBeVisible();
  await expect(this.page.getByRole("alert")).toHaveCount(0);
});

Then("selecting the current source commit leaves both histories unchanged", async function () {
  await expect(sourceGraph(this.page)).toBeVisible();
  assert.deepEqual(await sourceSnapshot(this.page), this.sourceBeforeSelection);
  const before = await graphSnapshot(this.page);
  const current = this.sourceBeforeSelection.find(revision => revision.current === "true");
  await sourceGraph(this.page).getByRole("button", { name: `Inspect commit ${current.oid.slice(0, 8)}`, exact: true }).click();
  await saved(this.page);
  assert.deepEqual(await graphSnapshot(this.page), before);
  assert.deepEqual(await sourceSnapshot(this.page), this.sourceBeforeSelection);
  await this.page.locator("[data-git-panel]").getByRole("button", {name:"Close",exact:true}).click();
});

Given("the earlier and latest source versions are recorded", async function () {
  const versions = await sourceSnapshot(this.page);
  assert.equal(versions.length, 2);
  this.checkoutVersions = { earlier: versions.find(version => version.message.trim() === "First source version").oid,
    latest: versions.find(version => version.current === "true").oid };
  assert.notEqual(this.checkoutVersions.earlier, this.checkoutVersions.latest);
});

When("I check out the recorded {string} source version", async function (name) {
  await expandSourceBranches(this.page);
  assert.ok(name in this.checkoutVersions);
  await saved(this.page);
  const button = sourceGraph(this.page).getByRole("button", {
    name: `Inspect commit ${this.checkoutVersions[name].slice(0, 8)}`, exact: true,
  });
  await expect(button).toBeEnabled();
  const bounds = await button.boundingBox();
  assert.ok(bounds);
  await button.click({ position: { x: bounds.width - 3, y: bounds.height / 2 } });
  await this.page.locator("[data-git-panel]").getByRole("button", {name:"Check out commit",exact:true}).click();
  await expect.poll(async () => await this.page.locator("[data-git-panel]").count() === 0 || await this.page.locator("[data-git-panel]").getByRole("alert").count() > 0).toBe(true);
  if (await this.page.locator("[data-git-panel]").count()) {
    this.checkoutError = await this.page.locator("[data-git-panel]").getByRole("alert").innerText();
    await this.page.locator("[data-git-panel]").getByRole("button", {name:"Close",exact:true}).click();
  }
  await saved(this.page);
});

Then("the recorded {string} source version is current in History", async function (name) {
  await expandSourceBranches(this.page);
  assert.ok(name in this.checkoutVersions);
  await saved(this.page);
  await expect(this.page.getByRole("region", { name: "History", exact: true })).toBeVisible();
  await expect(sourceGraph(this.page)).toBeVisible();
  await expect(sourceGraph(this.page).locator('li[aria-current="true"]')).toHaveAttribute("data-oid", this.checkoutVersions[name]);
  for (const oid of Object.values(this.checkoutVersions)) {
    await expect(sourceGraph(this.page).locator(`li[data-oid="${oid}"]`)).toBeVisible();
  }
});

Then("the branch menu shows the earlier detached commit", async function () {
  await saved(this.page);
  const branch = this.page.getByRole("button", { name: "Branch", exact: true });
  await expect(branch.locator(".navigation-label")).toHaveText(`Detached ${this.checkoutVersions.earlier.slice(0, 8)}`);
  const menu = await openNavigationMenu(this.page, "Branch");
  await expect(menu.getByRole("menuitemradio", { name: "main", exact: true })).toHaveAttribute("aria-checked", "false");
  await this.page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

When('I stage the current file before continuing the checkout draft',async function(){
  await saved(this.page);
  await this.page.getByRole('button',{name:'Commit changes',exact:true}).click();
  const panel=this.page.locator('[data-git-panel]');
  await expect(panel.locator('.staged-count')).toHaveText('1 file staged');
  await panel.getByRole('button',{name:'Close',exact:true}).click();await expect(panel).toHaveCount(0);await saved(this.page);
});
Then('the current file retains its staged checkout draft',async function(){
  await this.page.getByRole('button',{name:'Commit changes',exact:true}).click();
  const panel=this.page.locator('[data-git-panel]');
  await expect(panel.locator('.staged-count')).toHaveText('1 file staged');
  await panel.getByRole('button',{name:'Staged diff',exact:true}).click();
  await expect(this.page.getByRole('region',{name:'Staged file diff',exact:true}).getByLabel('Staged file',{exact:true})).toHaveText('ab!');
  await panel.getByRole('button',{name:'Close',exact:true}).click();await expect(panel).toHaveCount(0);await saved(this.page);
  await this.page.getByRole('button',{name:'Switch to notes.txt',exact:true}).click();await saved(this.page);
});

Then("the current source commit has an empty change graph", async function () {
  await saved(this.page);
  await selectPage(this.page,"History");
  await expect(changeGraph(this.page).locator("li[data-oid]")).toHaveCount(0);
  await expect(changeGraph(this.page)).toHaveText("No changes for this commit.");
});

Given("the current commit change graph is recorded", async function () {
  this.recordedScopedGraph = await graphSnapshot(this.page);
  assert.equal(this.recordedScopedGraph.revisions.length, 1,
    "Only the edit made after creating this source commit belongs in its graph");
  assert.equal(this.recordedScopedGraph.revisions[0].current, true);
});

Then("the recorded commit change graph is restored without loading its edits", async function () {
  await expect(changeGraph(this.page)).toBeVisible();
  const graph = await graphSnapshot(this.page);
  const withoutCurrent = value => ({ ...value, revisions: value.revisions.map(revision => ({ ...revision, current: false })) });
  assert.deepEqual(withoutCurrent(graph), withoutCurrent(this.recordedScopedGraph));
  assert.equal(graph.revisions.some(revision => revision.current), false,
    "Checkout keeps the clean source tree at its hidden baseline instead of restoring a dirty edit");
});

Given("the latest change graph revision and its parent are recorded", async function () {
  const graph = await graphSnapshot(this.page);
  const current = graph.revisions.filter(revision => revision.current);
  assert.equal(current.length, 1);
  assert.equal(current[0].parents.length, 1);
  this.retainedGraphRevision = current[0].oid;
  this.sharedGraphParent = current[0].parents[0];
});

When("I open the version history graph", async function () {
  await saved(this.page);
  await selectPage(this.page, "History");
  await expect(changeGraph(this.page)).toBeVisible();
});

Then("the change graph connects the current and retained revisions to their shared parent", async function () {
  const graph = await graphSnapshot(this.page);
  const current = graph.revisions.filter(revision => revision.current);
  assert.equal(current.length, 1);
  assert.notEqual(current[0].oid, this.retainedGraphRevision);
  assert.deepEqual(current[0].parents, [this.sharedGraphParent]);
  const retained = graph.revisions.find(revision => revision.oid === this.retainedGraphRevision);
  assert.ok(retained, "The abandoned future remains visible after a divergent edit");
  assert.deepEqual(retained.parents, [this.sharedGraphParent]);
  assert.equal(retained.current, false);
  assert.ok(graph.lanes >= 2, "Divergent Git revisions occupy separate graph lanes");
  const indices = new Map(graph.revisions.map((revision, index) => [revision.oid, index]));
  graph.anchors.forEach((oid, index) => indices.set(oid, graph.revisions.length + index));
  for (const [index, revision] of graph.revisions.entries()) {
    assert.match(revision.oid, /^[a-f0-9]{40}$/);
    assert.equal(revision.nodes, 1, "Each Git revision has one visible commit node");
    const visibleParents = revision.graphParents.filter(parent => indices.has(parent));
    for (const parent of visibleParents) {
      assert.ok(indices.get(parent) > index, "A child connects to a later row containing its visible Git ancestor");
    }
    assert.equal(revision.segments.filter(segment => segment.kind === "outgoing").length, visibleParents.length,
      "Only ancestors inside the visible commit scope receive graph connections");
    for (const segment of revision.segments) {
      assert.ok(segment.from >= 0 && segment.from < graph.lanes);
      assert.ok(segment.to >= 0 && segment.to < graph.lanes);
    }
  }
  assert.ok(graph.revisions.some(revision => revision.segments.some(segment => segment.from !== segment.to)),
    "The fork is drawn with a connection between graph lanes");
  this.recordedChangeGraph = graph;
});

When("I reload the version history graph", async function () {
  await saved(this.page);
  await this.page.reload({ waitUntil: "networkidle" });
  await saved(this.page);
  await expect(this.page.getByRole("region", { name: "History", exact: true })).toBeVisible();
});

Then("the change graph restores its connections and current marker", async function () {
  await expect(changeGraph(this.page)).toBeVisible();
  assert.deepEqual(await graphSnapshot(this.page), this.recordedChangeGraph);
});

Then("the change graph keeps its connected rows aligned in wide and narrow viewports", async function () {
  await mkdir(this.artifactDirectory, { recursive: true });
  for (const width of [1280, 390]) {
    await this.page.setViewportSize({ width, height: 900 });
    await expect(changeGraph(this.page)).toBeVisible();
    const rows = await changeGraph(this.page).locator("li[data-oid]").evaluateAll(elements => elements.map(element => {
      const row = element.getBoundingClientRect();
      const upper = element.querySelector(".rail-upper").getBoundingClientRect();
      const lower = element.querySelector(".rail-lower").getBoundingClientRect();
      const node = element.querySelector(".commit-node").getBoundingClientRect();
      return { top: row.top, bottom: row.bottom, railTop: upper.top, railBottom: lower.bottom,
        railLeft: upper.left, nodeCenter: node.top + node.height / 2, nodeY:parseFloat(getComputedStyle(element).getPropertyValue("--node-y")) };
    }));
    for (const [index, row] of rows.entries()) {
      assert.ok(Math.abs(row.railTop - row.top) < 1);
      assert.ok(Math.abs(row.railBottom - row.bottom) < 1);
      assert.ok(Math.abs(row.nodeCenter - row.top - row.nodeY) < 1);
      assert.ok(Math.abs(row.railLeft - rows[0].railLeft) < 1);
      if (index) assert.ok(Math.abs(row.railTop - rows[index - 1].railBottom) < 1,
        "Connections meet without gaps between adjacent commit rows");
    }
    assert.equal(await this.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const section = await changeGraph(this.page).locator("xpath=ancestor::section[1]").boundingBox();
    const contentLeft = await this.page.locator(".history-page").evaluate(element =>
      element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft));
    assert.ok(section && Math.abs(section.x - contentLeft) < 1 && section.x + section.width <= width,
      "The graph starts at the history page's content edge and fits the viewport");
    const screenshot = await this.page.screenshot({ path: join(this.artifactDirectory, `change-graph-${width}.png`) });
    await this.attach(screenshot, "image/png");
  }
});

When("I replace the code document with:", async function (text) {
  await editor(this.page).focus();
  await this.page.keyboard.press("Control+a");
  await this.page.keyboard.insertText(text);
  await saved(this.page);
});

When("I replace code line {int} with {string}", async function (number, text) {
  await editor(this.page).focus();
  await this.page.keyboard.press("Control+Home");
  for (let line = 1; line < number; line += 1) await this.page.keyboard.press("ArrowDown");
  await this.page.keyboard.press("Home");
  await this.page.keyboard.press("Shift+End");
  await this.page.keyboard.insertText(text);
  await saved(this.page);
});

When("I delete code line {int}", async function (number) {
  await editor(this.page).focus();
  await this.page.keyboard.press("Control+Home");
  for (let line = 1; line < number; line += 1) await this.page.keyboard.press("ArrowDown");
  await this.page.keyboard.press("Home");
  await this.page.keyboard.press("Shift+ArrowDown");
  await this.page.keyboard.press("Backspace");
  await saved(this.page);
});

Then("the current change graph revision for {string} shows {string}", async function (path, text) {
  await saved(this.page);
  await selectPage(this.page,"History");
  const row = changeGraph(this.page).locator('li[aria-current="true"]');
  await expect(row).toHaveCount(1);
  const change = row.locator(`.line-change[data-path=${JSON.stringify(path)}]`);
  await expectLineSummary(change, path, text);
  this.recordedGraphLineChanges ??= [];
  this.recordedGraphLineChanges.push({ oid: await row.getAttribute("data-oid"), path, text });
});

Then("all recorded change graph line summaries are visible", async function () {
  await saved(this.page);
  const graph = changeGraph(this.page);
  await expect(graph).toBeVisible();
  for (const { oid, path, text } of this.recordedGraphLineChanges) {
    const change = graph.locator(`li[data-oid="${oid}"] .line-change[data-path=${JSON.stringify(path)}]`);
    await expect(change).toBeVisible();
    await expectLineSummary(change, path, text);
  }
  const current = this.recordedGraphLineChanges.at(-1);
  await expect(graph.locator('li[aria-current="true"]')).toHaveAttribute("data-oid", current.oid);
});

Given("a source commit fixture has long multiline details", async function () {
  const details = Array.from({ length: 64 }, (_, index) =>
    `Detail ${index + 1}: Preserve the source history, editor state, and file contents while this long commit message wraps across the available width.`);
  this.multilineGraphCode = details.join("\n") + "\n";
  this.multilineGraphMessage = ["Source version with detailed notes", "", ...details.map(line => `    ${line}`),
    "", "The final paragraph must remain reachable through the History panel."].join("\n");
  await createSourceCommitFixture(this, this.multilineGraphMessage);
});

Then("long history graphs scroll only the History panel at wide and narrow sizes", async function () {
  const measurements = [];
  for (const name of ["Staged changes", "Commit history"]) {
    await this.page.getByRole("navigation",{name:"History views",exact:true}).getByRole("button",{name,exact:true}).click();
    await saved(this.page);
    if (name === "Commit history") {
      const message = this.page.getByRole("list", { name: "Commit history", exact: true }).locator(".commit-markdown");
      assert.deepEqual(await message.locator("p").allTextContents(), ["Source version with detailed notes",
        "The final paragraph must remain reachable through the History panel."]);
      assert.equal(await message.locator("pre code").textContent(), this.multilineGraphCode);
    }
    for (const width of [1280, 390]) {
      await this.page.setViewportSize({ width, height: 900 });
      const result = await this.page.locator("#panel-history").evaluate(panel => {
        const wrapper = Array.from(panel.querySelectorAll(".graph-scroll")).find(element => element.getClientRects().length);
        if (!wrapper) throw new Error("The visible history graph is missing");
        const measure = element => {
          const style = getComputedStyle(element);
          return { height: element.getBoundingClientRect().height, clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
            overflowX: style.overflowX, overflowY: style.overflowY };
        };
        const details = Array.from(wrapper.querySelectorAll(".change-details"));
        const documentSize = () => ({ width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight });
        const original = { wrapper: measure(wrapper), document: documentSize() };
        wrapper.style.overflowX = "auto";
        wrapper.style.overflowY = "auto";
        for (const detail of details) detail.style.position = "static";
        const previous = { wrapper: measure(wrapper), document: documentSize() };
        wrapper.style.removeProperty("overflow-x");
        wrapper.style.removeProperty("overflow-y");
        const overflowOnly = { wrapper: measure(wrapper), document: documentSize() };
        for (const detail of details) detail.style.removeProperty("position");
        const visible = [panel, ...panel.querySelectorAll("*")].filter(element => element.getClientRects().length);
        const scrolling = axis => visible.filter(element => {
          const style = getComputedStyle(element);
          return /^(auto|scroll)$/.test(axis === "y" ? style.overflowY : style.overflowX)
            && (axis === "y" ? element.scrollHeight > element.clientHeight : element.scrollWidth > element.clientWidth);
        }).map(element => element === panel ? "#panel-history" : `${element.tagName.toLowerCase()}.${element.className}`);
        const current = measure(wrapper);
        const outer = measure(panel);
        panel.scrollTop = panel.scrollHeight;
        const bottomReached = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
        panel.scrollTop = 0;
        return { original, previous, overflowOnly, current, panel: outer, vertical: scrolling("y"), horizontal: scrolling("x"), bottomReached,
          documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
          viewportWidth: innerWidth, viewportHeight: innerHeight };
      });
      measurements.push({ graph: name, width, ...result });
      await this.attach(JSON.stringify(measurements.at(-1), null, 2), "application/json");
      assert.deepEqual(result.vertical, ["#panel-history"], "Even a one-pixel overflow must not add a nested vertical scrollbar");
      assert.ok(result.horizontal.every(owner => owner === "#panel-history"));
      assert.equal(result.current.overflowY, "visible");
      assert.equal(result.current.overflowX, "visible");
      assert.equal(result.bottomReached, true);
      assert.ok(result.documentWidth <= result.viewportWidth && result.documentHeight <= result.viewportHeight);
    }
  }
});

// Three real Git writes and full reloads share this fixture step's timeout.
Given("source commit fixtures include scoped and ordinary messages", { timeout: 60_000 }, async function () {
  const scope = "very_long_repository_scope_".repeat(4);
  this.commitPrefixFixtures = [
    { type: "docs", scope: "mt5-eventbus", prefix: "docs(mt5-eventbus): ",
      body: "Update the documentation\r\n\r\n \t\r\n  Preserve this indented detail.\r\nKeep the final line.",
      paragraphs: ["Update the documentation", "Preserve this indented detail.\nKeep the final line."], breaks: 1 },
    { type: "feat!", scope, prefix: `feat(${scope})!:\t`,
      body: "Expand the repository interface\n\n\n  Keep the breaking-change explanation.",
      paragraphs: ["Expand the repository interface", "Keep the breaking-change explanation."], breaks: 0 },
    { type: null, scope: null, prefix: "",
      body: "Keep docs(mt5-eventbus): inside ordinary text\n \t \n\n  Preserve this indentation too.\n\n\nFinal paragraph.",
      paragraphs: ["Keep docs(mt5-eventbus): inside ordinary text", "Preserve this indentation too.", "Final paragraph."], breaks: 0 },
  ];
  for (const [index, fixture] of this.commitPrefixFixtures.entries()) {
    await editor(this.page).focus();
    await this.page.keyboard.press("Control+End");
    await this.page.keyboard.insertText(String(index));
    await saved(this.page);
    await createSourceCommitFixture(this, fixture.prefix + fixture.body);
    fixture.oid = (await repositorySnapshot(this.page)).head;
  }
});

Then("scoped commit pills preserve their type scope and multiline message", async function () {
  const graph = this.page.getByRole("list", { name: "Commit history", exact: true });
  await expect(graph).toBeVisible();
  for (const fixture of this.commitPrefixFixtures) {
    const row = graph.locator(`li[data-oid="${fixture.oid}"]`);
    const message = row.locator(".commit-markdown");
    const paragraphs = await message.locator("p").evaluateAll(elements => {
      const text = node => node.nodeName === "BR" ? "\n" : node.nodeType === Node.TEXT_NODE ? node.textContent
        : Array.from(node.childNodes, text).join("");
      return elements.map(text);
    });
    assert.deepEqual(paragraphs, fixture.paragraphs);
    await expect(message.locator(".commit-blank-line")).toHaveCount(0);
    await expect(message.locator("br")).toHaveCount(fixture.breaks);
    const pill = row.locator(".commit-prefix");
    await expect(pill).toHaveCount(fixture.type ? 1 : 0);
    if (fixture.type) {
      await expect(pill.locator(":scope > .commit-type")).toHaveText(fixture.type);
      await expect(pill.locator(":scope > .commit-scope")).toHaveText(fixture.scope);
    }
  }
  for (const width of [1280, 390]) {
    await this.page.setViewportSize({ width, height: 900 });
    for (const fixture of this.commitPrefixFixtures) {
      const paragraphs = await graph.locator(`li[data-oid="${fixture.oid}"] .commit-markdown p`).evaluateAll(elements =>
        elements.map(element => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const lines = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
          return { first: Math.min(...lines.map(rect => rect.top)), last: Math.max(...lines.map(rect => rect.top)),
            lineHeight: parseFloat(getComputedStyle(element).lineHeight) };
        }));
      for (let index = 1; index < paragraphs.length; index += 1) {
        const previous = paragraphs[index - 1];
        const gap = paragraphs[index].first - previous.last - previous.lineHeight;
        assert.ok(Math.abs(gap - 4) <= 1,
          `Paragraph ${index + 1} at ${width}px should have a compact 4px gap, received ${gap}px`);
      }
    }
  }
});

Then("long commit scopes fit a narrow viewport without horizontal scrolling", async function () {
  await this.page.setViewportSize({ width: 390, height: 900 });
  const layout = await this.page.locator("#panel-history").evaluate(panel => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    panelWidth: panel.clientWidth,
    panelScrollWidth: panel.scrollWidth,
    pills: Array.from(panel.querySelectorAll(".commit-prefix")).filter(element => element.getClientRects().length)
      .map(element => {
        const bounds = element.getBoundingClientRect();
        const parent = element.closest(".change-message").getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, parentLeft: parent.left, parentRight: parent.right };
      }),
  }));
  assert.ok(layout.documentWidth <= layout.viewportWidth);
  assert.ok(layout.panelScrollWidth <= layout.panelWidth);
  assert.equal(layout.pills.length, 2);
  for (const pill of layout.pills) assert.ok(pill.left >= pill.parentLeft && pill.right <= pill.parentRight + 1);
});

Then("commit pill text stays vertically centered at wide and narrow sizes", async function () {
  await mkdir(this.artifactDirectory, { recursive: true });
  await this.page.evaluate(() => document.fonts.ready);
  const graph = this.page.getByRole("list", { name: "Commit history", exact: true });
  const measure = () => graph.locator(".commit-time, .commit-hash, .commit-type, .commit-scope").evaluateAll(elements =>
    elements.map(element => {
      const pill = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      return { kind: element.className, text: element.textContent, height: pill.height, textHeight: text.height,
        centerOffset: text.top + text.height / 2 - pill.top - pill.height / 2 };
    }));
  for (const width of [1280, 390]) {
    await this.page.setViewportSize({ width, height: 900 });
    const geometry = await measure();
    await this.attach(JSON.stringify({ width, geometry }), "application/json");
    const screenshot = await graph.screenshot({ path: join(this.artifactDirectory, `pill-centered-${width}.png`) });
    await this.attach(screenshot, "image/png");
    for (const pill of geometry) assert.ok(Math.abs(pill.centerOffset) <= 0.5,
      `${pill.kind} text should remain centered inside its background at ${width}px (${pill.centerOffset}px offset)`);
  }
});

Then("all commit pill parts use the same typography", async function () {
  await this.page.evaluate(() => document.fonts.ready);
  const graph = this.page.getByRole("list", { name: "Commit history", exact: true });
  const typography = await graph.locator(".commit-time, .commit-hash, .commit-type, .commit-scope").evaluateAll(elements => {
    const properties = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant",
      "lineHeight", "letterSpacing", "fontFeatureSettings", "fontVariationSettings", "textTransform"];
    return elements.map(element => ({ kind: element.className, text: element.textContent,
      style: Object.fromEntries(properties.map(property => [property, getComputedStyle(element)[property]])) }));
  });
  for (const pill of typography) assert.deepEqual(pill.style, typography[0].style,
    `${pill.kind} must share the same computed typography as the timestamp pill`);
});

Given("a source commit fixture contains Markdown and untrusted content", async function () {
  const message = [
    "docs(renderer): # Rendering #123-45", "",
    "Keep **bold**, *emphasis*, ~~removed~~, `#literal`, escaped \\#escaped, and #123-45.", "",
    "- First item", "- Second item", "",
    "```js", 'const tag = "#not-a-tag";', "```", "",
    "[Reference](https://example.invalid/docs)",
    "[Unsafe](javascript:alert(1))",
    "![Remote alt](https://example.invalid/tracker.png)", "",
    "<script>globalThis.markdownExecuted = true</script>",
    '<img src="https://example.invalid/raw.png" onerror="globalThis.markdownExecuted = true">',
  ].join("\n");
  await createSourceCommitFixture(this, message);
  this.markdownCommit = (await repositorySnapshot(this.page)).head;
});

Then("the commit message renders Markdown structure and distinguishes headings from tags", async function () {
  const row = sourceGraph(this.page).locator(`li[data-oid="${this.markdownCommit}"]`);
  const message = row.locator(".commit-markdown");
  await expect(row.locator(".commit-type")).toHaveText("docs");
  await expect(row.locator(".commit-scope")).toHaveText("renderer");
  await expect(message.getByRole("heading", { level: 1 })).toHaveText("Rendering #123-45");
  await expect(message.locator(".commit-tag")).toHaveText(["#123-45", "#123-45"]);
  await expect(message.locator(".commit-tag a, a.commit-tag")).toHaveCount(0);
  await expect(message.locator("strong")).toHaveText("bold");
  await expect(message.locator("em")).toHaveText("emphasis");
  await expect(message.locator("s")).toHaveText("removed");
  await expect(message.locator("ul > li")).toHaveText(["First item", "Second item"]);
  assert.equal(await message.locator("pre code").textContent(), 'const tag = "#not-a-tag";\n');
  await expect(message.locator("code .commit-tag")).toHaveCount(0);
  await expect(message).toContainText("#escaped");
  const reference = message.getByRole("link", { name: "Reference", exact: true });
  await expect(reference).toHaveAttribute("href", "https://example.invalid/docs");
  await expect(reference).toHaveAttribute("target", "_blank");
  await expect(reference).toHaveAttribute("rel", /\bnoopener\b/);
  await expect(reference).toHaveAttribute("rel", /\bnoreferrer\b/);
});

Then("embedded commit content cannot execute scripts or load images", async function () {
  const message = sourceGraph(this.page).locator(`li[data-oid="${this.markdownCommit}"] .commit-markdown`);
  await expect(message.locator("script, img, iframe, object, embed, [onerror]")).toHaveCount(0);
  await expect(message.getByRole("link", { name: "Unsafe", exact: true })).toHaveCount(0);
  await expect(message).toContainText("Remote alt");
  await expect(message).toContainText("<script>globalThis.markdownExecuted = true</script>");
  assert.equal(await this.page.evaluate(() => globalThis.markdownExecuted), undefined);
  assert.equal(this.requests.some(request => request.url.startsWith("https://example.invalid/")), false,
    "Rendering commit text must not fetch any linked image or remote content");
});

Then("a link in an earlier change opens separately without restoring that change", async function () {
  const before = await graphSnapshot(this.page);
  const link = changeGraph(this.page).locator('li[data-oid]:not([aria-current="true"]) .commit-markdown a').first();
  await expect(link).toHaveAttribute("href", "https://example.invalid/");
  const destination = "https://example.invalid/";
  const fulfill = route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Fixture reference</title>" });
  await this.context.route(destination, fulfill);
  let popup;
  try {
    [popup] = await Promise.all([this.context.waitForEvent("page"), link.click()]);
    await popup.waitForURL(destination);
    await expect(popup).toHaveTitle("Fixture reference");
    await saved(this.page);
    assert.deepEqual(await graphSnapshot(this.page), before,
      "A Markdown link must not also activate the underlying change-load button");
    await expect(this.page.getByRole("region", { name: "History", exact: true })).toBeVisible();
  } finally {
    await popup?.close();
    await this.context.unroute(destination, fulfill);
  }
});

Given('the second branch revision is recorded',async function(){
  this.secondBranchTip=(await repositorySnapshot(this.page)).historyHead;
});


async function holdHistoryAnimations(graph){
  await graph.evaluate(element=>{
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(frames,options){
      const animation=animate.call(this,frames,options);
      // Let Svelte's zero-duration setup finish, then inspect the actual stages
      // without racing the shorter production timing.
      if(element.contains(this)&&Number(animation.effect.getTiming().duration)>0)animation.pause();
      return animation;
    };
  });
}

async function historyPhaseAnimations(graph,phase,progress,finish=false,visualPhase=phase){
  await expect(graph).toHaveAttribute('data-branch-motion',visualPhase);
  await expect.poll(()=>graph.evaluate((element,phase)=>{
    const animations=phase==='tree'
      ? Array.from(element.querySelectorAll('[data-branch-group]')).flatMap(group=>group.getAnimations())
        .filter(animation=>Number(animation.effect.getTiming().duration)>0&&animation.effect.getKeyframes().some(frame=>frame['--branch-block-height']))
      : element.getAnimations({subtree:true}).filter(animation=>animation.id===`history-branch-${phase}`);
    return animations.length;
  },phase)).toBeGreaterThan(0);
  const result=await graph.evaluate(async (element,{phase,progress,finish})=>{
    const animations=phase==='tree'
      ? Array.from(element.querySelectorAll('[data-branch-group]')).flatMap(group=>group.getAnimations())
        .filter(animation=>Number(animation.effect.getTiming().duration)>0&&animation.effect.getKeyframes().some(frame=>frame['--branch-block-height']))
      : element.getAnimations({subtree:true}).filter(animation=>animation.id===`history-branch-${phase}`);
    const durations=animations.map(animation=>Number(animation.effect.getTiming().duration));
    for(const animation of animations){
      if(finish)animation.finish();
      else {animation.pause();animation.currentTime=Number(animation.effect.getTiming().duration)*progress;}
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const elements=phase==='connections'?element.querySelectorAll('.growth-line')
      :phase==='messages-adjust'?animations.map(animation=>animation.effect.target.querySelector('.change-details'))
      :element.querySelectorAll('.motion-fading .change-details');
    return {count:animations.length,
      durations,
      treeProgress:phase==='tree'&&!finish?animations.map(animation=>{
        const group=animation.effect.target;
        return group.getBoundingClientRect().height/parseFloat(getComputedStyle(group).getPropertyValue('--branch-block-height'));
      }):[],
      growthProgress:phase==='connections'?parseFloat(getComputedStyle(element).getPropertyValue('--history-branch-growth'))/
        Math.max(...Array.from(element.querySelectorAll('.growth-line'),path=>Number(path.dataset.growthStart)+Number(path.dataset.growthLength))):null,
      growthDistances:phase==='connections'?animations.map(animation=>parseFloat(getComputedStyle(animation.effect.target).getPropertyValue('--history-branch-growth'))):[],
      transforms:Array.from(elements,node=>new DOMMatrix(getComputedStyle(node).transform).m41),
      clipPaths:Array.from(elements,node=>getComputedStyle(node).clipPath),
      opacities:Array.from(elements,node=>Number(getComputedStyle(node).opacity))};
  },{phase,progress,finish});
  assert.ok(result.durations.every(duration=>duration===180),'All stages use the normal 180 ms timing');
  return result;
}
const sampleHistoryPhase=(graph,phase,progress,visualPhase=phase)=>historyPhaseAnimations(graph,phase,progress,false,visualPhase);
const finishHistoryPhase=(graph,phase,visualPhase=phase)=>historyPhaseAnimations(graph,phase,1,true,visualPhase);
async function sampleHistoryTree(graph,ids){
  const sample=async progress=>{
    const result=await sampleHistoryPhase(graph,'tree',progress);
    assert.equal(result.count,1,'One shared clipping region reveals the branch rows');
    const closing=await graph.getAttribute('data-branch-direction')==='close';
    for(const actual of result.treeProgress)assert.ok(Math.abs(actual-(closing?1-progress:progress))<.025,
      `The middle of the sequence keeps a steady reveal pace: progress=${progress}, height=${actual}`);
    return graph.evaluate((element,ids)=>ids.map(id=>{
      const bounds=element.querySelector(`li[data-oid="${id}"]`).getBoundingClientRect();
      return {top:bounds.top,height:bounds.height};
    }),ids);
  };
  return {early:await sample(.25),late:await sample(.75)};
}

async function branchPainting(graph,tip,junction,path,connected=true){
  const geometry=await graph.evaluate((element,{tip,junction})=>{
    const row=element.querySelector(`li[data-oid="${tip}"]`),node=row.querySelector('.commit-node').getBoundingClientRect();
    const line=row.querySelector('.rail-lower .motion-connector[data-kind="outgoing"]');
    const root=element.getBoundingClientRect(),end=element.querySelector(`li[data-oid="${junction}"]`).getBoundingClientRect();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(line).stroke;context.fillRect(0,0,1,1);
    return {x:node.x+node.width/2-root.x,y:node.y+node.height/2-root.y,from:node.bottom+1-root.y,to:end.top-root.y,
      width:root.width,height:root.height,color:Array.from(context.getImageData(0,0,1,1).data).slice(0,3)};
  },{tip,junction});
  const png=await graph.screenshot({path});
  const {default:sharp}=await import('sharp');
  const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const scaleX=info.width/geometry.width,scaleY=info.height/geometry.height;
  if(!connected){
    for(const offset of [-4,4]){
      const index=(Math.round(geometry.y*scaleY)*info.width+Math.round((geometry.x+offset)*scaleX))*info.channels;
      assert.ok(!geometry.color.every((value,channel)=>Math.abs(data[index+channel]-value)<35),
        'A branch node stays hidden until its shared line reveal reaches it');
    }
    return png;
  }
  const x=Math.round(geometry.x*scaleX),from=Math.ceil(geometry.from*scaleY),to=Math.floor(geometry.to*scaleY);
  assert.ok(to-from>12,'The sampled branch spans multiple row fragments');
  for(let y=from;y<to;y++)assert.ok([-1,0,1].some(offset=>{
    const index=(y*info.width+x+offset)*info.channels;
    const background=(y*info.width+x+4)*info.channels;
    const distance=geometry.color.reduce((sum,value,channel)=>sum+(data[index+channel]-value)**2,0);
    const contrast=geometry.color.reduce((sum,value,channel)=>sum+(data[background+channel]-value)**2,0);
    // Fractional SVG boundaries antialias the stroke. Require visible ink at
    // every pixel row, while rejecting background-only gaps.
    return distance<contrast*.26;
  }),`The branch remains a continuous painted line at y=${y}`);
  return png;
}

async function growingBranchPainting(graph,path){
  const geometry=await graph.evaluate(element=>{
    const paths=Array.from(element.querySelectorAll('.growth-line'));
    const line=paths.sort((a,b)=>Number(b.dataset.growthLength)-Number(a.dataset.growthLength))[0];
    const distance=parseFloat(getComputedStyle(element).getPropertyValue('--history-branch-growth'));
    const fraction=Math.max(0,Math.min(1,(distance-Number(line.dataset.growthStart))/Number(line.dataset.growthLength)));
    const length=line.getTotalLength(),tip=length*fraction,matrix=line.getScreenCTM(),root=element.getBoundingClientRect();
    const nodes=Array.from(element.querySelectorAll('.commit-node'),node=>{
      const bounds=node.getBoundingClientRect();return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
    });
    const samples=[];
    for(let position=6;position<length-6;position+=2){
      if(Math.abs(position-tip)<4)continue;
      const point=line.getPointAtLength(position).matrixTransform(matrix);
      if(nodes.some(node=>Math.hypot(node.x-point.x,node.y-point.y)<7))continue;
      samples.push({x:point.x-root.x,y:point.y-root.y,drawn:position<tip});
    }
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(line).stroke;context.fillRect(0,0,1,1);
    return {samples,width:root.width,height:root.height,color:Array.from(context.getImageData(0,0,1,1).data).slice(0,3)};
  });
  const png=await graph.screenshot({path});
  const {default:sharp}=await import('sharp');
  const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.ok(geometry.samples.filter(sample=>sample.drawn).length>2,'Part of the continuous stroke has grown from its junction');
  assert.ok(geometry.samples.filter(sample=>!sample.drawn).length>2,'The remainder of the stroke has not appeared');
  for(const sample of geometry.samples){
    const x=Math.round(sample.x*info.width/geometry.width),y=Math.round(sample.y*info.height/geometry.height);
    const ink=[-1,0,1].some(dx=>[-1,0,1].some(dy=>{
      const index=((y+dy)*info.width+x+dx)*info.channels;
      return geometry.color.every((value,channel)=>Math.abs(data[index+channel]-value)<35);
    }));
    assert.equal(ink,sample.drawn,'Only the continuous portion behind the growing tip is painted');
  }
  return png;
}

Then('the History branch tag toggles all branches at its junction without changing saved history', {timeout:60000}, async function () {
  const page=this.page;
  await selectPage(page,'History');await saved(page);
  const graph=changeGraph(page),before=await repositorySnapshot(page);
  const first=this.retainedGraphRevision,second=this.secondBranchTip;
  const row=id=>graph.locator(`li[data-oid="${id}"]`);
  const tag=graph.locator('[data-branch-id]');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect.poll(() => tag.evaluate(element => {
    const graph = element.closest('.change-graph');
    return Math.abs(parseFloat(getComputedStyle(graph).getPropertyValue('--branch-tag-width')) - element.getBoundingClientRect().width);
  })).toBeLessThanOrEqual(1);
  const gutter = await graph.evaluate(element => ({ graph: element.getBoundingClientRect().left, panel: element.closest('.scroll-panel').getBoundingClientRect().left }));
  assert.ok(Math.abs(gutter.graph - gutter.panel) < 1, 'History has no unused outer left padding');
  const junctionOid=await tag.getAttribute('data-branch-id');
  const junctionTime=before.history.find(version=>version.oid===junctionOid).timestamp;
  const newestBranchTime=Math.max(...before.history.filter(version=>version.oid===first||version.oid===second).map(version=>version.timestamp));
  const outsideIds=before.history.filter(version=>version.timestamp<junctionTime||version.timestamp>newestBranchTime).map(version=>version.oid);
  assert.ok(outsideIds.length>=2,'The fixture has messages above and below the reveal interval');
  const retainedIds=await graph.locator('li[data-oid]').evaluateAll(rows=>rows.map(row=>row.dataset.oid));
  async function messagePositions(ids=retainedIds){
    return graph.evaluate((element,ids)=>ids.map(id=>{
      const row=element.querySelector(`li[data-oid="${id}"]`),message=row.querySelector('.change-details');
      const style=getComputedStyle(message),bounds=message.getBoundingClientRect();
      return {id,left:bounds.left,width:bounds.width,affected:row.classList.contains('motion-affected'),
        opacity:Number(style.opacity),translate:new DOMMatrix(style.transform).m41,
        inert:row.querySelector('.message-viewport').inert};
    }),ids);
  }
  const initialPositions=await messagePositions();
  function assertPositions(actual,expected,explanation){
    for(const position of actual)assert.ok(Math.abs(position.left-expected.find(item=>item.id===position.id).left)<1,explanation);
  }
  async function assertRetainedMessagesStayVisible(){
    for(const style of await messagePositions()){
      assert.equal(style.opacity,1,'Retained messages remain visible throughout opening and closing');
      assert.equal(style.translate,0,'Messages do not slide out of their own viewport');
      assert.equal(style.inert,false,'Visible message links remain available');
    }
  }
  async function assertOutsideMessagesStayVisible(){
    const styles=await messagePositions(outsideIds);
    for(const style of styles){
      assert.equal(style.affected,false,'Messages outside the timestamp interval are excluded from motion');
      assert.equal(style.opacity,1);assert.equal(style.translate,0);assert.equal(style.inert,false);
    }
    assertPositions(styles,initialPositions,'Older and newer messages keep their horizontal positions');
  }
  const mainlineText=row(before.historyHead).locator('.change-details');
  const mainlineLeft=(await mainlineText.boundingBox()).x;
  await expect(graph).toHaveAttribute('data-lanes','1');
  await expect(row(first)).toHaveCount(0);await expect(row(second)).toHaveCount(0);
  await expect(tag).toHaveCount(1);await expect(tag).toHaveText('2 · 2');
  await expect(tag).toHaveAttribute('aria-expanded','false');
  const label=await tag.boundingBox();
  const node=await tag.locator('xpath=ancestor::li[1]').locator('.commit-node').boundingBox();
  assert.ok(label.x+label.width<node.x,'Branch count label stays to the left of the graph');
  const junction=tag.locator('xpath=ancestor::li[1]');
  const checkpoint=await junction.locator('.change-load').boundingBox();
  assert.ok(checkpoint.x>=label.x+label.width&&checkpoint.x<=node.x,
    'Checkpoint hit area includes the tree and excludes the branch tag');
  await tag.hover();
  assert.equal(await junction.evaluate(element=>getComputedStyle(element,'::before').backgroundColor),'rgba(0, 0, 0, 0)',
    'Hovering a branch tag does not highlight the checkpoint');
  await page.emulateMedia({reducedMotion:'no-preference'});
  await holdHistoryAnimations(graph);
  await tag.click();
  await expect(graph).toHaveAttribute('data-branch-motion','messages-adjust');
  await expect(tag).toBeFocused();
  await expect(row(first)).toHaveCount(0);await expect(row(second)).toHaveCount(0);
  await sampleHistoryPhase(graph,'messages-adjust',.25);
  const earlyShift=await messagePositions();
  await sampleHistoryPhase(graph,'messages-adjust',.75);
  const lateShift=await messagePositions();
  await assertRetainedMessagesStayVisible();
  await assertOutsideMessagesStayVisible();
  await finishHistoryPhase(graph,'messages-adjust');
  await expect(graph).toHaveAttribute('data-branch-motion','tree');
  await expect(row(first)).toBeAttached();await expect(row(second)).toBeAttached();
  const expandedPositions=await messagePositions();
  assert.ok(expandedPositions.some(position=>position.left>initialPositions.find(item=>item.id===position.id).left+1),
    'Existing messages make horizontal room before the branch tree opens');
  for(const position of expandedPositions){
    const start=initialPositions.find(item=>item.id===position.id).left;
    const early=earlyShift.find(item=>item.id===position.id).left,late=lateShift.find(item=>item.id===position.id).left;
    assert.ok(start<=early+.5&&early<=late+.5&&late<=position.left+.5,
      'Messages move continuously between their old and new tree widths');
    assert.ok(position.left-start<=Number(await graph.getAttribute('data-lanes'))*20,
      'Message travel is bounded by the added graph lanes');
  }
  assert.equal(await graph.locator('li[data-oid]').evaluateAll(rows=>rows.flatMap(row=>row.getAnimations())
    .filter(animation=>Number(animation.effect.getTiming().duration)>0&&animation.effect.getKeyframes().some(frame=>frame['--branch-block-height'])).length),0,
    'Commit rows do not run independent slide animations');
  const movement=await sampleHistoryTree(graph,[first,second]);
  await assertRetainedMessagesStayVisible();
  assertPositions(await messagePositions(),expandedPositions,'Retained messages do not move horizontally during the tree reveal');
  await assertOutsideMessagesStayVisible();
  for(let index=0;index<2;index++){
    assert.ok(Math.abs(movement.early[index].height-movement.late[index].height)<1,
      'Each commit retains its full height throughout the shared reveal');
    assert.ok(Math.abs(movement.early[index].top-movement.late[index].top)<1,
      'The reveal uncovers stationary branch contents');
  }
  assert.ok(Math.abs((movement.early[1].top-movement.early[0].top)-(movement.late[1].top-movement.late[0].top))<1,
    'Branch commits keep constant spacing during the tree-only reveal');
  const hidden=await graph.locator('.motion-fading .change-details').evaluateAll(elements=>elements.map(element=>getComputedStyle(element).opacity));
  assert.equal(hidden.length,2);
  assert.ok(hidden.every(opacity=>opacity==='0'),'Only new branch messages stay hidden while the tree reveals');
  assert.ok((await graph.locator('.motion-fading .message-viewport').evaluateAll(elements=>elements.map(element=>element.inert))).every(Boolean),
    'Hidden message links cannot receive focus during the reveal');
  assert.equal(await mainlineText.evaluate(element=>getComputedStyle(element).opacity),'1','An unaffected message stays visible');
  await this.attach(await branchPainting(graph,second,junctionOid,join(this.artifactDirectory,'history-nodes-before-line-reveal.png'),false),'image/png');
  await finishHistoryPhase(graph,'tree');
  const connections=await sampleHistoryPhase(graph,'connections',.25,'tree');
  assert.equal(connections.count,1,'One shared distance animates the continuous branch strokes');
  assert.ok(Math.abs(connections.growthProgress-.25)<.025,'Line growth continues at the steady pace of the vertical reveal');
  assert.ok(await graph.locator('.motion-connector[data-kind="through"]').count(),
    'The slide includes the straight branch run between bends');
  await sampleHistoryPhase(graph,'connections',.5,'tree');
  await this.attach(await growingBranchPainting(graph,join(this.artifactDirectory,'history-branch-growing-stroke.png')),'image/png');
  const laterConnections=await sampleHistoryPhase(graph,'connections',.75,'tree');
  assert.ok(Math.abs(laterConnections.growthProgress-.75)<.025,'Line growth does not restart its acceleration in the middle of the sequence');
  assert.ok(connections.growthDistances[0]>0&&laterConnections.growthDistances[0]>connections.growthDistances[0],
    'The stroke grows continuously around its bend and up its vertical run');
  assert.ok(laterConnections.opacities.every(opacity=>opacity===1),'The L-branches stay opaque during their slide');
  await assertRetainedMessagesStayVisible();
  await expect(graph).toHaveAttribute('data-branch-motion','tree');
  await finishHistoryPhase(graph,'connections','tree');
  await expect(graph).toHaveAttribute('data-branch-motion','messages-fade');
  const branchPositions=await messagePositions([first,second]);
  const incoming=await sampleHistoryPhase(graph,'messages-fade',.5);
  await this.attach(await branchPainting(graph,second,junctionOid,join(this.artifactDirectory,'history-tree-and-connector-reveal.png')),'image/png');
  assert.ok(incoming.opacities.length&&incoming.opacities.every(opacity=>opacity>0&&opacity<1),'New messages fade in after the tree opens');
  assert.ok(incoming.transforms.every(x=>x===0),'New messages fade without horizontal travel');
  assertPositions(await messagePositions([first,second]),branchPositions,'New messages fade in at their final positions');
  assertPositions(await messagePositions(),expandedPositions,'Retained messages stay beside the expanded tree');
  await assertRetainedMessagesStayVisible();
  await assertOutsideMessagesStayVisible();
  await this.attach(await graph.screenshot({path:join(this.artifactDirectory,'history-messages-fade.png')}),'image/png');
  await finishHistoryPhase(graph,'messages-fade');
  await expect(graph).toHaveAttribute('data-branch-motion','idle');
  await expect(tag).toHaveAttribute('aria-expanded','true');
  await expect(row(first)).toBeVisible();await expect(row(second)).toBeVisible();
  await expect(graph.locator('li[data-oid]')).toHaveCount(before.history.length);
  assertPositions(await messagePositions(),expandedPositions,'Finishing the reveal does not shift retained messages');
  await expect.poll(async()=>Math.abs((await mainlineText.boundingBox()).x-mainlineLeft)).toBeLessThan(1);
  await tag.focus();await tag.press('Enter');
  const closingMessages=await sampleHistoryPhase(graph,'messages-fade',.5);
  assert.ok(closingMessages.opacities.length&&closingMessages.opacities.every(opacity=>opacity>0&&opacity<1),
    'Only removed messages fade before the branch tree folds');
  assert.ok(closingMessages.transforms.every(x=>x===0),'Removed messages fade in place');
  await assertRetainedMessagesStayVisible();
  assertPositions(await messagePositions(),expandedPositions,'Retained messages stay in place while removed messages fade');
  const retracting=await sampleHistoryPhase(graph,'connections',.25,'messages-fade');
  const laterRetractions=await sampleHistoryPhase(graph,'connections',.75,'messages-fade');
  assert.equal(retracting.count,1,'The complete strokes retract through one shared distance');
  assert.ok(laterRetractions.growthDistances[0]>0&&laterRetractions.growthDistances[0]<retracting.growthDistances[0],
    'Connecting elbows retract toward the mainline while removed messages fade');
  assert.ok(laterRetractions.opacities.every(opacity=>opacity===1),'Retracting L-branches do not fade');
  await finishHistoryPhase(graph,'connections','messages-fade');
  await finishHistoryPhase(graph,'messages-fade');
  const closingMovement=await sampleHistoryTree(graph,[first,second]);
  for(let index=0;index<2;index++)assert.ok(Math.abs(closingMovement.early[index].top-closingMovement.late[index].top)<1,
    'Folding clips stationary contents without sliding rows in the opposite direction');
  assert.ok(await graph.locator('path').evaluateAll(paths=>paths.filter(path=>path.dataset.from===path.dataset.to&&!path.classList.contains('motion-connector'))
    .every(path=>getComputedStyle(path).clipPath==='none'&&getComputedStyle(path).opacity==='1')),
    'Folding branch lines does not hide the retained mainline');
  assert.equal(await row(first).evaluate(element=>{
    const node=element.querySelector('.commit-node').getBoundingClientRect();
    return element.querySelector('svg').getBoundingClientRect().right>=node.right;
  }),true,'The old branch rail stays wide enough to draw its nodes throughout folding');
  await assertRetainedMessagesStayVisible();
  assertPositions(await messagePositions(),expandedPositions,'Retained messages keep the expanded width until the tree has folded');
  await assertOutsideMessagesStayVisible();
  await finishHistoryPhase(graph,'tree');
  await sampleHistoryPhase(graph,'messages-adjust',.25);
  const earlyClose=await messagePositions();
  await sampleHistoryPhase(graph,'messages-adjust',.75);
  const lateClose=await messagePositions();
  for(const position of expandedPositions){
    const finish=initialPositions.find(item=>item.id===position.id).left;
    const early=earlyClose.find(item=>item.id===position.id).left,late=lateClose.find(item=>item.id===position.id).left;
    assert.ok(position.left+.5>=early&&early+.5>=late&&late+.5>=finish,
      'Retained messages move left to fit the narrower tree only after folding');
  }
  await assertRetainedMessagesStayVisible();
  await assertOutsideMessagesStayVisible();
  await finishHistoryPhase(graph,'messages-adjust');
  await expect(graph).toHaveAttribute('data-branch-motion','idle');
  await expect(tag).toHaveAttribute('aria-expanded','false');
  await expect(row(first)).toHaveCount(0);await expect(row(second)).toHaveCount(0);
  assertPositions(await messagePositions(),initialPositions,'Closing restores the original message positions');
  assert.deepEqual(await repositorySnapshot(page),before,'Branch expansion is display-only');
  await tag.click();
  await page.reload();await saved(page);
  await expect(changeGraph(page)).toHaveAttribute('data-lanes','1');
  await expect(tag).toHaveText('2 · 2');await expect(tag).toHaveAttribute('aria-expanded','false');
});

Given('the nested branch tip is recorded', async function () {
  await saved(this.page);this.nestedBranchTip=(await repositorySnapshot(this.page)).historyHead;
});
Given('the parent branch tip is recorded', async function () {
  await saved(this.page);this.parentBranchTip=(await repositorySnapshot(this.page)).historyHead;
});
Then('the nested History branch slides without restarting its parent block', {timeout:60000}, async function () {
  const page=this.page;
  await selectPage(page,'History');await saved(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  const graph=changeGraph(page),before=await repositorySnapshot(page);
  await graph.locator('[data-branch-id]').click();
  const parent=graph.locator(`li[data-oid="${this.parentBranchTip}"]`);
  await expect(parent).toBeVisible();
  const outer=graph.locator('[data-branch-group]').first();
  const outerId=await outer.getAttribute('data-branch-group');
  const parentHeight=(await parent.boundingBox()).height;
  const nested=graph.locator(`li[data-oid="${this.nestedBranchTip}"]`);
  await expect(nested).toHaveCount(0);
  const tag=outer.locator('[data-branch-id]');
  await expect(tag).toHaveCount(1);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await holdHistoryAnimations(graph);
  await tag.click();
  await finishHistoryPhase(graph,'messages-adjust');
  await expect(graph).toHaveAttribute('data-branch-motion','tree');
  await expect(nested).toBeAttached();
  await expect(outer).toHaveAttribute('data-branch-group',outerId);
  assert.equal(await outer.evaluate(element=>element.getAnimations().length),0,
    'Opening a nested group does not restart the outer block transition');
  assert.ok(Math.abs((await parent.boundingBox()).height-parentHeight)<1,
    'The visible parent revision keeps its full height');
  const group=nested.locator('xpath=ancestor::li[@data-branch-group][1]');
  await expect(group).toHaveAttribute('data-branch-group',/./);
  assert.equal(await group.evaluate(element=>element.getAnimations().length),1,
    'The nested branch has one shared block animation');
  await finishHistoryPhase(graph,'tree');
  await finishHistoryPhase(graph,'connections','tree');
  await finishHistoryPhase(graph,'messages-fade');
  await expect(graph).toHaveAttribute('data-branch-motion','idle');
  assert.deepEqual(await repositorySnapshot(page),before,'Nested animation leaves saved history unchanged');
});

Then('model navigation cancels the unfinished History branch reveal', {timeout:60000}, async function () {
  const page=this.page;
  await selectPage(page,'History');await saved(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  const graph=changeGraph(page);
  await holdHistoryAnimations(graph);
  await graph.locator('[data-branch-id]').click();
  await finishHistoryPhase(graph,'messages-adjust');
  await sampleHistoryPhase(graph,'tree',.5);
  await page.getByRole('button',{name:'Undo history',exact:true}).click();
  await saved(page);
  await expect(graph).toHaveAttribute('data-branch-motion','idle');
  await expect(editor(page)).toHaveText('a');
  await expect.poll(()=>graph.evaluate(element=>element.getAnimations({subtree:true})
    .filter(animation=>animation.id.startsWith('history-branch-')||animation.effect.getKeyframes()
      .some(frame=>frame['--branch-block-height'])).length)).toBe(0);
  await expect(graph.locator('.motion-affected')).toHaveCount(0);
  await expect(graph.locator('[data-branch-id]').first()).toBeEnabled();
});

Then('native History branch playback keeps newly revealed nodes connected', {timeout:60000}, async function () {
  const page=this.page,{default:sharp}=await import('sharp');
  await selectPage(page,'History');await saved(page);
  const graph=changeGraph(page),before=await repositorySnapshot(page);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await graph.locator('[data-branch-id]').click();
  await page.waitForFunction(()=>document.querySelector('.change-graph')?.dataset.branchMotion==='tree');
  let movingFrames=0,connectedNodes=0;
  for(let frame=0;frame<40;frame++){
    const geometry=await graph.evaluate(element=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
      const context=canvas.getContext('2d');
      return {phase:element.dataset.branchMotion,width:innerWidth,height:innerHeight,
        nodes:Array.from(element.querySelectorAll('.motion-fading .commit-node'),node=>{
          const bounds=node.getBoundingClientRect(),group=node.closest('[data-branch-group]').getBoundingClientRect();
          context.clearRect(0,0,1,1);context.fillStyle=getComputedStyle(node).borderTopColor;context.fillRect(0,0,1,1);
          return {x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,below:bounds.bottom+3,
            inside:bounds.bottom+5<group.bottom,color:Array.from(context.getImageData(0,0,1,1).data).slice(0,3)};
        })};
    });
    const png=await page.screenshot();
    const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const scaleX=info.width/geometry.width,scaleY=info.height/geometry.height;
    const ink=(x,y,color)=>{
      const index=(Math.round(y*scaleY)*info.width+Math.round(x*scaleX))*info.channels;
      return color.every((value,channel)=>Math.abs(data[index+channel]-value)<35);
    };
    if(geometry.phase==='tree')movingFrames++;
    for(const node of geometry.nodes)if(node.inside&&ink(node.x-4,node.y,node.color)&&ink(node.x+4,node.y,node.color)){
      connectedNodes++;
      const connected=[-1,0,1].some(offset=>ink(node.x+offset,node.below,node.color));
      if(!connected)await this.attach(png,'image/png');
      assert.ok(connected,'A fully revealed node has its painted connecting line during native playback');
    }
    if(geometry.phase==='idle')break;
  }
  assert.ok(movingFrames,'The check observes native motion at the normal speed');
  assert.ok(connectedNodes,'The check samples newly revealed branch nodes');
  await expect(graph).toHaveAttribute('data-branch-motion','idle');
  assert.deepEqual(await repositorySnapshot(page),before,'Native animation leaves saved history unchanged');
});
