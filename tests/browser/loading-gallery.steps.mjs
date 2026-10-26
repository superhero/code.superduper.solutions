// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

const stages = ["storage", "recovery", "repository", "files", "git", "history", "preferences", "editor", "workspace"];
const titles = ["Opening local storage", "Recovering unfinished work", "Opening repository",
  "Reading files and folders", "Reading Git history", "Restoring history state", "Applying preferences",
  "Preparing the editor", "Restoring viewport"];
const gallery = page => page.getByRole("main", { name: "Loading progress" });
const cards = page => gallery(page).getByRole("article");
const stage = (page, id) => gallery(page).locator(`article[data-stage="${id}"]`);

async function desktopTitleLayout(page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(cards(page)).toHaveCount(9);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return cards(page).evaluateAll(elements => elements.map(element => ({
    id: element.dataset.stage,
    bounds: [element, element.querySelector(".stage"), element.querySelector(".drawing-frame")].map(node => {
      const rect = node.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 100) / 100);
    }),
  })));
}

async function animationStates(page) {
  return cards(page).evaluateAll(elements => elements.map(element => element.getAnimations({ subtree: true })
    .map(animation => ({ state: animation.playState, time: animation.currentTime,
      duration: animation.effect.getTiming().duration }))));
}

async function visualStates(page) {
  return cards(page).evaluateAll(elements => elements.map(element => JSON.stringify(
    [...element.querySelectorAll(".stage *")].map(node => {
      const style = getComputedStyle(node);
      return [style.transform, style.opacity, style.clipPath, style.strokeDashoffset, style.fill,
        style.color, style.backgroundColor];
    }))));
}

Given("loading gallery motion is enabled", async function () {
  await this.page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(async () => (await animationStates(this.page))
    .filter(animations => animations.length && animations.every(animation => animation.state === "running")).length)
    .toBe(9);
});

Then("the loading gallery has its brand header and animated loading footer without controls", async function () {
  assert.deepEqual((await gallery(this.page).locator("header").innerText()).split(/\n+/).map(line => line.trim()).filter(Boolean),
    ["code.", "A HEADLESS BROWSER IDE"]);
  await expect(gallery(this.page).getByRole("heading", { level: 1, name: "code.", exact: true })).toBeVisible();
  await expect(gallery(this.page).getByRole("button")).toHaveCount(0);
  await expect(gallery(this.page).getByRole("combobox")).toHaveCount(0);
  await expect(gallery(this.page).getByRole("link")).toHaveCount(0);
  await expect(gallery(this.page).locator("footer")).toHaveText("Loading...");
  await expect(gallery(this.page).getByRole("list")).toHaveCount(0);
  await expect(gallery(this.page).locator(".sub-items, .compact-detail, [data-item]")).toHaveCount(0);
});

Then("all nine loading stages fit in the desktop viewport", async function () {
  await expect(cards(this.page)).toHaveCount(9);
  for (const title of titles) await expect(gallery(this.page).getByRole("article", { name: title, exact: true })).toBeInViewport();
  const bounds = await cards(this.page).evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight };
  }));
  for (const [index, rect] of bounds.entries()) {
    assert.ok(rect.left >= 0 && rect.right <= rect.viewportWidth && rect.top >= 0 && rect.bottom <= rect.viewportHeight,
      `${titles[index]} should fit completely in the desktop viewport: ${JSON.stringify(rect)}`);
  }
  assert.equal(new Set(bounds.map(rect => Math.round(rect.top))).size, 3, "Desktop stages form three rows");
  assert.equal(new Set(bounds.map(rect => Math.round(rect.left))).size, 3, "Desktop stages form three columns");
});

Then("the preview reports resolved startup work and skips an absent repository", async function () {
  await expect.poll(() => gallery(this.page).locator("article").evaluateAll(elements => elements.map(element =>
    element.dataset.status))).toEqual(["complete", "complete", "complete", "skipped", "skipped", "complete", "complete", "skipped", "complete"]);
  await expect(this.page.locator("#app")).toHaveAttribute("inert", "");
});

When("I open the editor from the pinned loading preview", async function () {
  await this.page.goto(`${this.baseURL}/?editor=1`, { waitUntil: "networkidle" });
  await expect(this.page.locator("#startup-status")).toHaveCount(0);
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
});

Given("the next preview holds metadata and active file reads separately", async function () {
  await this.page.addInitScript(() => {
    const send = Worker.prototype.postMessage;
    const held = { metadata: [], document: [] };
    const released = { metadata: false, document: false };
    globalThis.__previewHeldReads = held;
    globalThis.__releasePreviewReads = phase => {
      released[phase] = true;
      for (const { worker, message, options } of held[phase]) send.call(worker, message, ...options);
      held[phase] = [];
      if (released.metadata && released.document) Worker.prototype.postMessage = send;
    };
    Worker.prototype.postMessage = function (message, ...options) {
      const phase = ["list", "loadPreferences"].includes(message?.method) ? "metadata"
        : message?.method === "read" ? "document" : null;
      if (phase && !released[phase]) { held[phase].push({ worker: this, message, options }); return; }
      return send.call(this, message, ...options);
    };
  });
});

When("I reload into the compact pinned loading preview", async function () {
  await this.page.setViewportSize({ width: 390, height: 844 });
  await this.page.goto(`${this.baseURL}/?loaders=1`, { waitUntil: "networkidle" });
  await expect.poll(() => this.page.evaluate(() => globalThis.__previewHeldReads.metadata.length)).toBe(2);
});

Then("the compact loading preview shows the pending repository work", async function () {
  await expect(cards(this.page)).toHaveCount(6);
  await expect(stage(this.page, "repository")).toBeVisible();
  await expect(stage(this.page, "repository")).toHaveAttribute("data-status", "running");
  await expect(stage(this.page, "files")).toHaveAttribute("data-status", "pending");
  await stage(this.page, "repository").hover();
  await stage(this.page, "repository").hover();
  await expect(stage(this.page, "repository").locator("h2")).toBeVisible();
});

Then("pending loading titles stay hidden until their work starts", async function () {
  this.loadingTitleLayout = await desktopTitleLayout(this.page);
  await expect(stage(this.page, "files").locator("h2")).toBeHidden();
  await stage(this.page, "repository").hover();
  await expect(stage(this.page, "repository").locator("h2")).toBeVisible();
  await stage(this.page, "storage").hover();
  await expect(stage(this.page, "storage").locator("h2")).toBeVisible();
  await this.page.setViewportSize({ width: 390, height: 844 });
});

When("I release the preview metadata reads", async function () {
  await this.page.evaluate(() => globalThis.__releasePreviewReads("metadata"));
});

Then("the compact loading preview advances to preparing the active file", async function () {
  await expect.poll(() => this.page.evaluate(() => globalThis.__previewHeldReads.document.length)).toBeGreaterThan(0);
  await expect(cards(this.page)).toHaveCount(6);
  await expect(stage(this.page, "editor")).toBeVisible();
  await expect(stage(this.page, "editor")).toHaveAttribute("data-status", "running");
  await stage(this.page, "editor").hover();
  await stage(this.page, "editor").hover();
  await expect(stage(this.page, "editor").locator("h2")).toBeVisible();
  await expect(stage(this.page, "files")).toHaveAttribute("data-status", "running");
  await expect(stage(this.page, "git")).toHaveAttribute("data-status", "complete");
  await expect(this.page.locator("#app")).toHaveAttribute("inert", "");
});

Then("started loading titles appear without moving their drawings", async function () {
  assert.deepEqual(await desktopTitleLayout(this.page), this.loadingTitleLayout,
    "Showing a title preserves every card and drawing's position and size");
  await stage(this.page, "editor").hover();
  await expect(stage(this.page, "editor").locator("h2")).toBeVisible();
  await stage(this.page, "git").hover();
  await expect(stage(this.page, "git").locator("h2")).toBeVisible();
  await this.page.setViewportSize({ width: 390, height: 844 });
});

When("I release the preview active file reads", async function () {
  await this.page.evaluate(() => globalThis.__releasePreviewReads("document"));
});

Then("the loading preview reports the saved editor and workspace ready", async function () {
  await expect.poll(() => gallery(this.page).locator("article").evaluateAll(elements => elements
    .filter(element => !["complete", "skipped"].includes(element.dataset.status)).map(element => element.dataset.stage)))
    .toEqual([]);
  for (const id of ["storage", "repository", "files", "git", "history", "preferences", "editor", "workspace"]) {
    await expect(stage(this.page, id)).toHaveAttribute("data-status", "complete");
  }
  await expect(this.page.locator('.file-tabs button.active')).toHaveAttribute("aria-label", "Switch to alpha.txt");
  await expect(this.page.locator(".cm-content")).toContainText("line_001");
  await expect(this.page.locator("#app")).toHaveAttribute("inert", "");
  await expect(gallery(this.page)).toBeVisible();
});

Then("completed loading stages retain only their titles without changing the layout", async function () {
  assert.deepEqual(await desktopTitleLayout(this.page), this.loadingTitleLayout,
    "Completed titles preserve the layout reserved while loading was pending");
  for (const id of stages) {
    await stage(this.page,id).hover();
    await expect(stage(this.page, id).locator("h2")).toBeVisible();
  }
  await expect(gallery(this.page).getByRole("list")).toHaveCount(0);
  await expect(gallery(this.page).locator(".sub-items, .compact-detail, [data-item]")).toHaveCount(0);
});

Then("every loading alternative visibly changes over time", async function () {
  const initial = await visualStates(this.page);
  const changed = new Set();
  await expect.poll(async () => {
    for (const [index, value] of (await visualStates(this.page)).entries()) {
      if (value !== initial[index]) changed.add(titles[index]);
    }
    return [...changed].sort();
  }, { timeout: 5_000, message: "Each alternative must change a painted property, beyond merely having an animation name" })
    .toEqual([...titles].sort());
});

Then("a desktop loading gallery preview is saved", async function () {
  await this.page.screenshot({ path: "tmp/test/browser/gallery.png", fullPage: true });
});

Then("each loading animation uses its authored cycle duration",async function(){
  await expect.poll(async()=>(await animationStates(this.page)).map(animations=>
    [...new Set(animations.map(animation=>Math.round(animation.duration)))]))
    .toEqual([5000,6000,12000,5950,8900,4030,7650,6100,5500].map(duration=>[duration]));
});

Given("reduced motion is preferred in the loading gallery", async function () {
  await this.page.emulateMedia({ reducedMotion: "reduce" });
});

Then("the loading gallery fits these viewport sizes without scrolling", async function (table) {
  for (const row of table.hashes()) {
    const width = Number(row.width), height = Number(row.height), count = Number(row.cards);
    const screen = `${width}×${height}`;
    await this.page.setViewportSize({ width, height });
    await expect(cards(this.page)).toHaveCount(count);
    await expect.poll(() => cards(this.page).evaluateAll(elements => elements.every(card => {
      const stage = card.querySelector(".stage").getBoundingClientRect();
      const drawing = card.querySelector('.stage [aria-hidden="true"]').getBoundingClientRect();
      return drawing.left >= stage.left - .5 && drawing.right <= stage.right + .5
        && drawing.top >= stage.top - .5 && drawing.bottom <= stage.bottom + .5;
    })), { message: `${screen} drawings finish resizing within their stages` }).toBe(true);
    const layout = await gallery(this.page).evaluate(element => {
      const rectangle = node => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      };
      return {
        surfaces: [document.documentElement, document.body, document.getElementById("startup-status"), element,
          element.querySelector(".studies")].map(node => ({
          name: node.id || node.className || node.tagName,
          scrollWidth: node.scrollWidth, width: node.clientWidth,
          scrollHeight: node.scrollHeight, height: node.clientHeight,
        })),
        cards: [...element.querySelectorAll("article")].filter(card => getComputedStyle(card).display !== "none")
          .map(card => ({
            name: document.getElementById(card.getAttribute("aria-labelledby")).textContent,
            bounds: rectangle(card),
            stage: rectangle(card.querySelector(".stage")),
            drawing: rectangle(card.querySelector('.stage [aria-hidden="true"]')),
            title: rectangle(card.querySelector("h2")),
          })),
      };
    });
    const visibleIndices = layout.cards.map(card => titles.indexOf(card.name));
    assert.ok(visibleIndices.every(index => index >= 0), `${screen} shows real startup stage names`);
    assert.deepEqual(visibleIndices, [...new Set(visibleIndices)].sort((a, b) => a - b), `${screen} keeps stage order`);
    for (const surface of layout.surfaces) {
      assert.ok(surface.scrollWidth <= surface.width + 1 && surface.scrollHeight <= surface.height + 1,
        `${screen} must not scroll inside ${surface.name}: ${JSON.stringify(surface)}`);
    }
    const rows = count === 9 ? 3 : count / 2;
    const columns = count === 9 ? 3 : 2;
    assert.equal(new Set(layout.cards.map(card => Math.round(card.bounds.top))).size, rows, `${screen} has ${rows} rows`);
    assert.equal(new Set(layout.cards.map(card => Math.round(card.bounds.left))).size, columns, `${screen} has ${columns} columns`);
    for (const card of layout.cards) {
      for (const [name, bounds] of [["card", card.bounds], ["drawing", card.drawing], ["title", card.title]]) {
        assert.ok(bounds.left >= -.5 && bounds.top >= -.5 && bounds.right <= width + .5 && bounds.bottom <= height + .5,
          `${screen}: ${card.name} ${name} fits the viewport: ${JSON.stringify(bounds)}`);
      }
      assert.ok(card.drawing.left >= card.stage.left - .5 && card.drawing.right <= card.stage.right + .5
        && card.drawing.top >= card.stage.top - .5 && card.drawing.bottom <= card.stage.bottom + .5,
      `${screen}: ${card.name} drawing fits both axes of its stage`);
    }
    await this.page.mouse.move(width / 2, height / 2);
    await this.page.mouse.wheel(600, 1200);
    const offsets = await this.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      const element = document.querySelector('main[aria-label="Loading progress"]');
      resolve({ x: scrollX, y: scrollY, galleryX: element.scrollLeft, galleryY: element.scrollTop });
    }))));
    assert.deepEqual(offsets, { x: 0, y: 0, galleryX: 0, galleryY: 0 }, `${screen} stays fixed when scrolling is attempted`);
    if (width === 390 || width === 768) {
      await this.page.screenshot({ path: `tmp/test/browser/gallery-${width}x${height}.png`, fullPage: true });
    }
  }
});

Then("the loading alternatives have no running animations", async function () {
  const running = await gallery(this.page).evaluate(element => element.getAnimations({ subtree: true })
    .filter(animation => animation.playState === "running" || animation.pending).length);
  assert.equal(running, 0, "Reduced motion leaves the studies and loading dots still");
});

Then('preference animation icons highlight in order and retain their completed color',async function(){
  const result=await stage(this.page,'preferences').evaluate(card=>{
    const probe=document.createElement('span');card.append(probe);
    const color=value=>{probe.style.color=value;return getComputedStyle(probe).color;};
    const reference=card.closest('main').querySelector('[data-stage="files"] .written i:nth-child(2)');
    const highlight=getComputedStyle(reference).backgroundColor,completed=color('var(--loader-accent)');
    const icons=[...card.querySelectorAll('.station')];
    const frames=[1000,1900,2800,3850,4900].map(time=>{
      for(const icon of icons){const animation=icon.getAnimations()[0];animation.pause();animation.currentTime=time;}
      return icons.map(icon=>getComputedStyle(icon).color);
    });
    probe.remove();return {highlight,completed,frames};
  });
  assert.notEqual(result.highlight,result.completed);
  for(let index=0;index<4;index++){
    assert.equal(result.frames[index][index],result.highlight);
    for(let previous=0;previous<index;previous++)assert.equal(result.frames[index][previous],result.completed);
  }
  assert.deepEqual(result.frames[4],Array(4).fill(result.completed));
});


Then('the nine loading drawings hold completed actions while retaining movement speed',async function(){
  await this.page.setViewportSize({width:1280,height:900});
  await this.page.emulateMedia({reducedMotion:'no-preference'});
  await expect(cards(this.page)).toHaveCount(9);
  const result=await gallery(this.page).evaluate(root=>{
    const plans=[
      ['storage','.layer-third','opacity',5000,[1000,1350],[600,960]],
      ['recovery','.left','strokeDashoffset',6000,[1100,1450],[500,1040]],
      ['repository','.folder-front','transform',12000,[100,1100],[1200,1680]],
      ['files','.code-line:nth-child(4) .written','clipPath',5950,[2000,4700],[1500,1950]],
      ['git','.commit-stream','transform',8900,[641,719],[400,640]],
      ['history','.shelf:first-child','transform',4030,[1800,2850],[1350,1650]],
      ['preferences','.station-fourth','color',7650,[5400,6600],[3980,4070]],
      ['editor','.editor-active-line','opacity',6100,[2700,5700],[1650,1800]],
      ['workspace','.panel:first-child','transform',5500,[2100,2900],[600,840]],
    ];
    return plans.map(([id,selector,property,duration,hold,movement])=>{
      const card=root.querySelector(`[data-stage="${id}"]`),element=card.querySelector(selector),animations=card.querySelector('.stage').getAnimations({subtree:true});
      animations.forEach(animation=>animation.pause());
      const sample=time=>{animations.forEach(animation=>{animation.currentTime=time;});return getComputedStyle(element)[property];};
      const held=sample(hold[0])===sample(hold[1]),moves=sample(movement[0])!==sample(movement[1]);
      const actual=element.getAnimations()[0].effect.getTiming().duration;
      return {id,held,moves,duration:Math.abs(Number(actual)-Number(duration))<.01};
    });
  });
  for(const item of result)expect(item).toEqual({id:item.id,held:true,moves:true,duration:true});
  await expect(stage(this.page,'repository').locator('.folder-file')).toHaveCount(4);
  await expect(gallery(this.page).locator('.number, .line-number, .editor-line-number')).toHaveCount(0);
});

Then('typing starts without waiting and the final commit is circled during its finished hold',async function(){
  await this.page.setViewportSize({width:1280,height:900});
  await this.page.emulateMedia({reducedMotion:'no-preference'});
  const result=await gallery(this.page).evaluate(root=>{
    const sample=(id,selector,property,time)=>{
      const card=root.querySelector(`[data-stage="${id}"]`);
      for(const animation of card.querySelector('.stage').getAnimations({subtree:true})){animation.pause();animation.currentTime=time;}
      return getComputedStyle(card.querySelector(selector))[property];
    };
    return {
      cursorBlinks:sample('editor','.editor-caret','opacity',4900)!==sample('editor','.editor-caret','opacity',5200),
      immediate:sample('files','.written','clipPath',0)!==sample('files','.written','clipPath',200),
      typedHold:sample('files','.code-line:nth-child(4) .written','clipPath',2000)===sample('files','.code-line:nth-child(4) .written','clipPath',4700),
      commitHold:sample('git','.commit-stream','transform',4900)===sample('git','.commit-stream','transform',7500),
      ringDrawing:sample('git','.commit-complete-ring','strokeDashoffset',5500)!==sample('git','.commit-complete-ring','strokeDashoffset',6100),
      ringComplete:parseFloat(sample('git','.commit-complete-ring','strokeDashoffset',6400))===0,
      ringVisible:sample('git','.commit-complete-ring','opacity',7500)==='1'
    };
  });
  expect(result).toEqual({cursorBlinks:true,immediate:true,typedHold:true,commitHold:true,ringDrawing:true,ringComplete:true,ringVisible:true});
});

Then('loading pane hover reveals and drops its title while preserving drawing geometry',async function(){
  await this.page.setViewportSize({width:1280,height:900});
  await this.page.emulateMedia({reducedMotion:'no-preference'});
  const card=stage(this.page,'storage'),caption=card.locator('.caption');
  await gallery(this.page).getByRole('heading',{name:'code.',exact:true}).hover();
  await card.evaluate(node=>{node.dataset.status='running';node.classList.remove('presented');});
  await expect(caption).toBeHidden();
  const before=await card.locator('.drawing-frame').boundingBox();
  await card.hover();
  await expect.poll(()=>card.evaluate(node=>getComputedStyle(node).getPropertyValue('--pane-opacity').trim())).toBe('50%');
  await expect(caption).toHaveCSS('opacity','1');await expect(caption).toHaveCSS('transform','matrix(1, 0, 0, 1, 0, 0)');
  await expect(caption.locator('.caption-title')).toHaveText('Opening local storage');
  expect(await card.locator('.drawing-frame').boundingBox()).toEqual(before);
  await gallery(this.page).getByRole('heading',{name:'code.',exact:true}).hover();await expect(caption).toBeHidden();
  await expect.poll(()=>card.evaluate(node=>getComputedStyle(node).getPropertyValue('--pane-opacity').trim())).toBe('25%');
  await card.evaluate(node=>{node.dataset.status='complete';node.classList.add('presented');});await card.hover();
  await expect.poll(()=>card.evaluate(node=>getComputedStyle(node).getPropertyValue('--pane-opacity').trim())).toBe('100%');
});
