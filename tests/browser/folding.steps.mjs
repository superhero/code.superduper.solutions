// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { selectPage, selectDropdown } from "./navigation.helpers.mjs";

const scroller = page => page.locator(".cm-editor > .cm-scroller");
const documentInput = page => scroller(page).locator(".cm-content");
const overlay = page => page.locator(".cm-fold-motion");

async function headerGeometry(page, animated = false) {
  const root = animated ? overlay(page) : scroller(page);
  return root.locator(".cm-content .cm-line").first().evaluate(line => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const token = walker.nextNode();
    if (token?.textContent !== "function") throw new Error("Measure the unchanged leading keyword");
    const range = document.createRange();
    range.selectNodeContents(token);
    const rect = value => ({ x: value.x, y: value.y, width: value.width, height: value.height });
    const typography = element => {
      const style = getComputedStyle(element);
      return Object.fromEntries(["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing"]
        .map(property => [property, style[property]]));
    };
    return { line: rect(line.getBoundingClientRect()), token: rect(range.getBoundingClientRect()),
      lineType: typography(line), tokenType: typography(token.parentElement) };
  });
}

async function pauseFold(world, trigger) {
  if (trigger === "gutter") await expect(scroller(world.page).locator('[title="Fold line"]')).toBeVisible();
  if (trigger === "placeholder") await expect(scroller(world.page).locator(".cm-foldPlaceholder")).toHaveCount(1);
  world.foldFrame = await world.page.evaluate(async action => {
    const editor = document.querySelector(".cm-editor > .cm-scroller");
    const previous = document.querySelector(".cm-fold-motion");
    if (action === "gutter" || action === "placeholder") {
      const target = editor.querySelector(action === "gutter" ? '[title="Fold line"]' : ".cm-foldPlaceholder");
      target.click();
    } else {
      const opening = action === "reverse";
      editor.querySelector(".cm-content").dispatchEvent(new KeyboardEvent("keydown", {
        key: opening ? "}" : "{", code: opening ? "BracketRight" : "BracketLeft",
        keyCode: opening ? 221 : 219, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true,
      }));
    }
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const motion = document.querySelector(".cm-fold-motion");
    if (!motion) throw new Error("Code folding must create a sliding overlay");
    const animations = motion.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 90;
    }
    const body = motion.querySelector('[data-fold-part="body"]');
    const animation = animations.find(item => item.effect.target === body);
    if (!animation) throw new Error("The fold body must animate its height");
    const frames = animation.effect.getKeyframes();
    return {
      start: Number(body.dataset.oldHeight),
      end: Number(body.dataset.newHeight),
      height: body.getBoundingClientRect().height - Number.parseFloat(getComputedStyle(body).clipPath.split(" ")[2]),
      duration: animation.effect.getTiming().duration,
      hidden: motion.getAttribute("aria-hidden"),
      inert: motion.inert,
      opacity: getComputedStyle(editor.querySelector(".cm-content")).opacity,
      gutters: motion.querySelectorAll(".cm-gutterElement").length,
      replacedPrevious: !previous || (!previous.isConnected && previous !== motion),
      movingHead: animations.some(animation=>animation.effect.target.dataset.foldPart==='head'),
      movingBody: frames.some(frame=>frame.transform&&frame.transform!=='none'),
    };
  }, trigger);
}

Given("code fold motion is reduced", async function () {
  await this.page.emulateMedia({ reducedMotion: "reduce" });
});

When("I pause a gutter code fold halfway through its transition", async function () {
  await pauseFold(this, "gutter");
});

When("I pause a placeholder code unfold halfway through its transition", async function () {
  await pauseFold(this, "placeholder");
});

When("I pause a keyboard code fold halfway through its transition", async function () {
  await documentInput(this.page).focus();
  await this.page.keyboard.press("Control+Home");
  await expect(scroller(this.page).locator('[title="Fold line"]').first()).toBeVisible();
  await pauseFold(this, "keyboard");
});

When("I reverse the paused code fold with the keyboard", async function () {
  await pauseFold(this, "reverse");
});

Then("the code fold is sliding {word}", async function (direction) {
  const frame = this.foldFrame;
  assert.equal(frame.duration, 180);
  assert.equal(frame.hidden, "true");
  assert.equal(frame.inert, true);
  assert.equal(frame.opacity, "0");
  assert.ok(frame.gutters > 0, "Line numbers and fold markers travel with the code");
  assert.equal(frame.movingHead,false,'The header and content above it must stay fixed');
  assert.equal(frame.movingBody,false,'The fold body must reveal vertically without moving the header');
  assert.equal(frame.replacedPrevious, true, "A new fold cancels its previous visual overlay");
  assert.ok(Number.isFinite(frame.start) && Number.isFinite(frame.end));
  assert.ok(direction === "closed" ? frame.start > frame.end : frame.start < frame.end);
  assert.ok(frame.height > Math.min(frame.start, frame.end) + 0.1, "Midpoint has not reached the smaller height");
  assert.ok(frame.height < Math.max(frame.start, frame.end) - 0.1, "Midpoint has left the larger height");
});

When("I finish the code fold transition", async function () {
  await overlay(this.page).evaluate(element => {
    for (const animation of element.getAnimations({ subtree: true })) animation.finish();
  });
  await expect(overlay(this.page)).toHaveCount(0);
  await expect(scroller(this.page)).toHaveCSS("opacity", "1");
});

Then("the native code fold is {word}", async function (state) {
  await expect(overlay(this.page)).toHaveCount(0);
  await expect(scroller(this.page)).toHaveCSS("opacity", "1");
  await expect(scroller(this.page).locator(".cm-foldPlaceholder")).toHaveCount(state === "collapsed" ? 1 : 0);
  await expect(scroller(this.page).locator(state === "collapsed" ? '[title="Unfold line"]:visible' : '[title="Fold line"]:visible'))
    .toBeVisible();
});

When("I toggle the code fold without animation using the {word}", async function (control) {
  const target = scroller(this.page).locator(control === "gutter" ? '[title="Fold line"]' : ".cm-foldPlaceholder");
  await expect(target).toBeVisible();
  assert.equal(await target.evaluate(element => {
    element.click();
    return document.querySelectorAll(".cm-fold-motion").length;
  }), 0);
});

When("I insert {string} during the paused code fold transition", async function (value) {
  await expect(overlay(this.page)).toHaveCount(1);
  await this.page.keyboard.insertText(value);
  await expect(overlay(this.page)).toHaveCount(0);
  await expect(scroller(this.page)).toHaveCSS("opacity", "1");
});

When("I use the editor font {string} at size {int} and line height {float}", async function (font, size, height) {
  const saved = () => expect(this.page.getByRole("status", { name: "Persistence status", exact: true }))
    .toHaveText("All changes saved");
  await selectPage(this.page, "Settings");
  await selectDropdown(this.page, "Settings scope", "global");
  await selectDropdown(this.page, "Editor font", { label: font });
  await saved();
  await this.page.getByLabel("Font size", { exact: true }).fill(String(size));
  await this.page.getByLabel("Font size", { exact: true }).press("Tab");
  await saved();
  await this.page.getByLabel("Line height", { exact: true }).fill(String(height));
  await this.page.getByLabel("Line height", { exact: true }).press("Tab");
  await saved();
  await selectPage(this.page, "Editor");
  await expect(scroller(this.page)).toHaveCSS("font-size", `${size}px`);
  await expect(scroller(this.page)).toHaveCSS("line-height", `${Number((size * height).toFixed(3))}px`);
});

Given("the fold header geometry is recorded", async function () {
  await expect(scroller(this.page).locator('[title="Fold line"]')).toBeVisible();
  this.foldHeaderGeometry = await headerGeometry(this.page);
});

Then("the {word} fold header keeps its original geometry", async function (kind) {
  const current = await headerGeometry(this.page, kind === "animated");
  const original = this.foldHeaderGeometry;
  const native = kind === "animated" ? await headerGeometry(this.page) : current;
  for (const part of ["line", "token"]) {
    for (const property of ["x", "y", "width", "height"]) {
      assert.ok(Math.abs(current[part][property] - original[part][property]) < 0.1,
        `${kind} header ${part}.${property} changed from ${original[part][property]} to ${current[part][property]}; ` +
        JSON.stringify({ original, current, native }));
    }
  }
  assert.deepEqual(current.lineType, original.lineType, "Header line typography stays unchanged");
  assert.deepEqual(current.tokenType, original.tokenType, "Leading token typography stays unchanged");
});

Then('the toggled fold header has a two pixel minimap-colored bottom line',async function(){
  const line=scroller(this.page).locator('.cm-content .cm-fold-boundary').first();
  await expect(line).toBeVisible();
  const result=await line.evaluate(element=>{
    const style=getComputedStyle(element,'::after');
    const reference=document.createElement('div');reference.style.backgroundColor='color-mix(in srgb,var(--color-surface) 20%,var(--color-background))';element.closest('.cm-editor').append(reference);
    const color=getComputedStyle(reference).backgroundColor;reference.remove();
    return {height:style.height,color:style.backgroundColor,expected:color};
  });
  assert.equal(result.height,'2px');assert.equal(result.color,result.expected);
});

Then('a layout scroll notification does not cancel the closing slide',async function(){
  await scroller(this.page).evaluate(element=>element.dispatchEvent(new Event('scroll')));
  await expect(overlay(this.page)).toHaveCount(1);
});

Then('the minimap remains visible during the fold slide',async function(){
  const map=scroller(this.page).locator('.cm-minimap-gutter');
  await expect(map).toBeVisible();
  const opacity=await map.evaluate(element=>{
    let opacity=1;for(let node=element;node;node=node.parentElement)opacity*=Number(getComputedStyle(node).opacity);
    return opacity;
  });
  assert.equal(opacity,1);
  const positions=await overlay(this.page).evaluate(element=>({right:element.getBoundingClientRect().right,map:element.parentElement.querySelector('.cm-minimap-gutter').getBoundingClientRect().left}));
  assert.ok(Math.abs(positions.right-positions.map)<1,'The animation must not cover the minimap');
});

When('I collapse the final long function near the document bottom',async function(){
  await scroller(this.page).evaluate(element=>{element.scrollTop=245*parseFloat(getComputedStyle(element).lineHeight);});
  const header=documentInput(this.page).locator('.cm-line').filter({hasText:'function tail()'});
  await expect(header).toBeVisible();
  this.fixedFoldHeaderTop=await header.evaluate(element=>element.getBoundingClientRect().top);
  await scroller(this.page).locator('[title="Fold line"]:visible').first().click();
  await this.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(scroller(this.page).locator('.cm-foldPlaceholder')).toHaveCount(1);
  await expect(overlay(this.page)).toHaveCount(0);
  const closed=await header.evaluate(element=>element.getBoundingClientRect().top);
  assert.ok(Math.abs(closed-this.fixedFoldHeaderTop)<1,'Collapsing must not move the header');
});
Then('finishing the unfold keeps the function header at its animated position',async function(){
  const last=await overlay(this.page).evaluate(element=>{
    element.getAnimations({subtree:true}).forEach(animation=>animation.finish());
    const header=[...element.querySelectorAll('[data-fold-part="head"] .cm-line')].find(line=>line.textContent.includes('function tail()'));
    if(!header)throw new Error('The unfolding header must be in the viewport snapshot');
    return header.getBoundingClientRect().top;
  });
  await expect(overlay(this.page)).toHaveCount(0);
  await this.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const native=await documentInput(this.page).locator('.cm-line').filter({hasText:'function tail()'}).evaluate(element=>element.getBoundingClientRect().top);
  assert.ok(Math.abs(last-native)<1,`Fold header jumped from ${last} to ${native}`);
  assert.ok(Math.abs(native-this.fixedFoldHeaderTop)<1,'Unfolding must not move the header or the content above it');
});

Then('repeating the fold keeps the header fixed in both directions',async function(){
  for(let repeat=0;repeat<2;repeat++){
    for(const opening of [false,true]){
      await pauseFold(this,opening?'placeholder':'gutter');
      await overlay(this.page).evaluate(element=>element.getAnimations({subtree:true}).forEach(animation=>animation.finish()));
      await expect(overlay(this.page)).toHaveCount(0);
      const top=await documentInput(this.page).locator('.cm-line').filter({hasText:'function tail()'}).evaluate(element=>element.getBoundingClientRect().top);
      assert.ok(Math.abs(top-this.fixedFoldHeaderTop)<1,`Repeated ${opening?'unfold':'fold'} moved the header`);
    }
  }
});

Then('the unfolded header has no bottom boundary',async function(){
  await expect(scroller(this.page).locator('.cm-fold-boundary')).toHaveCount(0);
});
Then('the sliding header retains its bottom boundary',async function(){
  await expect(overlay(this.page).locator('[data-fold-part="head"] .cm-fold-boundary')).toHaveCount(1);
});
