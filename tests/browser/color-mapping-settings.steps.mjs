// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { When, Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { selectDropdown, selectPage, openNavigationMenu } from "./navigation.helpers.mjs";

const pane = page => page.getByRole("region", {name:"Editor colors",exact:true});
const saved = page => expect(page.getByRole("status", {name:"Persistence status",exact:true})).toHaveText("All changes saved");
async function rangeValue(locator, value) {
  await locator.evaluate((input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event("input", {bubbles:true}));
    input.dispatchEvent(new Event("change", {bubbles:true}));
  }, value);
}

When("I open editor colors in the {string} settings scope", async function (scope) {
  if (!this.colorEditorElement) this.colorEditorElement = await this.page.locator(".cm-editor").first().elementHandle();
  await saved(this.page);
  await selectPage(this.page,"Settings");
  await selectDropdown(this.page,"Settings scope",scope);
  if (scope !== "file") await expect(pane(this.page)).toBeVisible();
});

When("I set these editor color sources:", async function (table) {
  for (const {label,source} of table.hashes()) {
    await selectDropdown(this.page,`${label} color`,source);
    await saved(this.page);
  }
});

When("I set selection opacity to {int} percent", async function (value) {
  await rangeValue(this.page.getByRole("slider",{name:"Selection opacity",exact:true}),value);
  await saved(this.page);
});

When("I set the {string} secondary color to {string} with {int} percent of the first color", async function (label, source, weight) {
  const blend = this.page.getByRole("button", {name:`Blend ${label} color`,exact:true});
  if (await blend.getAttribute("aria-pressed") !== "true") {
    await blend.click();
    await saved(this.page);
  }
  await selectDropdown(this.page,`${label} mix color`,source);
  await saved(this.page);
  await rangeValue(this.page.getByRole("slider",{name:`${label} color mix`,exact:true}),weight);
  await saved(this.page);
});

When("I reload the editor color settings", async function () {
  await saved(this.page);
  await this.page.reload();
  await expect(pane(this.page)).toBeVisible();
});

When("I return to the editor from color settings", async function () {
  await selectPage(this.page,"Editor");
});

for (const [verb, label] of [["undo","Undo"],["redo","Redo"]]) When(`I ${verb} the current color settings`, async function () {
  await saved(this.page);
  await this.page.getByRole("button",{name:label,exact:true}).click();
  await saved(this.page);
});

When("I reset the editor color mappings", async function () {
  await pane(this.page).getByRole("button",{name:"Reset color mappings",exact:true}).click();
  await saved(this.page);
});

When("I reset selection color opacity", async function () {
  await pane(this.page).getByRole("button",{name:"Reset selection opacity",exact:true}).click();
  await saved(this.page);
});

Then("the {string} editor color source is {string}", async function (label, value) {
  await expect(pane(this.page).getByRole("button",{name:`${label} color`,exact:true})).toHaveAttribute("data-value",value);
});

Then("the {string} color mix is {int} percent", async function (label, value) {
  await expect(this.page.getByRole("slider",{name:`${label} color mix`,exact:true})).toHaveValue(String(value));
});

Then("selection opacity is {int} percent", async function (value) {
  await expect(this.page.getByRole("slider",{name:"Selection opacity",exact:true})).toHaveValue(String(value));
});

Then("editor color mappings are hidden for file settings", async function () {
  await expect(pane(this.page)).toBeHidden();
});

Then("the editor color previews match the existing editor without reopening it", async function () {
  const previews = await pane(this.page).locator("[data-color-role]").evaluateAll(rows => {
    const canvas = document.createElement("canvas");canvas.width=canvas.height=1;
    const drawing = canvas.getContext("2d",{willReadFrequently:true});
    return rows.map(row => {
      drawing.clearRect(0,0,1,1);
      drawing.fillStyle=getComputedStyle(row.querySelector(".color-swatch")).backgroundColor;drawing.fillRect(0,0,1,1);
      return {role:row.dataset.colorRole,color:[...drawing.getImageData(0,0,1,1).data]};
    });
  });
  await selectPage(this.page,"Editor");
  assert.equal(await this.colorEditorElement.evaluate(element => element === document.querySelector(".cm-editor")),true);
  const actual = await this.page.locator(".cm-editor").evaluate((root, previews) => {
    const probe=document.createElement("span");root.append(probe);
    const canvas=document.createElement("canvas");canvas.width=canvas.height=1;
    const drawing=canvas.getContext("2d",{willReadFrequently:true});
    try {return previews.map(({role})=>{
      probe.style.color=`var(--syntax-${role})`;drawing.clearRect(0,0,1,1);
      drawing.fillStyle=getComputedStyle(probe).color;drawing.fillRect(0,0,1,1);
      return {role,color:[...drawing.getImageData(0,0,1,1).data]};
    });} finally {probe.remove();}
  },previews);
  assert.deepEqual(actual,previews);
});

Then("the editor uses the selected selection color at {int} percent opacity", async function (opacity) {
  const content=this.page.getByLabel("Code editor document",{exact:true});
  await content.focus();await this.page.keyboard.press("ControlOrMeta+Home");
  await this.page.keyboard.press("ControlOrMeta+Shift+ArrowRight");
  const selection=this.page.locator(".cm-editor .cm-joinedSelectionLayer .cm-selectionBackground");
  await expect(selection).toBeVisible();
  assert.equal(await selection.evaluate((element,opacity)=>{
    const editor=element.closest(".cm-editor"),probe=document.createElement("span");
    probe.style.backgroundColor=`color-mix(in srgb,var(--palette-7) ${opacity}%,transparent)`;
    editor.append(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();
    return getComputedStyle(element).backgroundColor===expected;
  },opacity),true);
  await this.page.keyboard.press("ArrowRight");
});

Then("the minimap paints the configured operator dot and semicolon colors", async function () {
  const root=this.page.locator(".cm-editor");
  await expect(root.locator(".cm-minimap-inner canvas")).toBeVisible();
  await expect.poll(()=>root.evaluate(element=>{
    const canvas=element.querySelector(".cm-minimap-inner canvas"),pixels=canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
    const colors=new Set();for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]===255)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    const probe=document.createElement("span");element.append(probe);
    const sample=document.createElement("canvas");sample.width=sample.height=1;
    const drawing=sample.getContext("2d",{willReadFrequently:true});
    try{return ["operator","dot","semicolon"].every(role=>{
      probe.style.color=`var(--syntax-${role})`;drawing.fillStyle=getComputedStyle(probe).color;drawing.fillRect(0,0,1,1);
      return colors.has([...drawing.getImageData(0,0,1,1).data].slice(0,3).join(","));
    });}finally{probe.remove();}
  })).toBe(true);
});

Then("editor color controls fit wide and narrow pages and expose palette swatches", async function () {
  const page=this.page;
  for (const width of [1440,760,390]) {
    await page.setViewportSize({width,height:980});
    await expect(pane(page).locator("[data-color-role]")).toHaveCount(23);
    const overflow=await pane(page).evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth}));
    assert.ok(overflow.scroll<=overflow.width+1,JSON.stringify({width,...overflow}));
    const menu=await openNavigationMenu(page,"Operators color");
    await expect(menu.locator(".option-swatch")).toHaveCount(13);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }
  await page.getByRole("textbox",{name:"Filter editor colors",exact:true}).fill("semicolon");
  await expect(pane(page).locator("[data-color-role]")).toHaveCount(1);
  await page.getByRole("textbox",{name:"Filter editor colors",exact:true}).fill("");
  await page.setViewportSize({width:1440,height:980});
  await pane(page).scrollIntoViewIfNeeded();
  await mkdir(this.artifactDirectory,{recursive:true});
  await page.screenshot({path:join(this.artifactDirectory,"editor-colors.png")});
});

Then("the {string} color blend is disabled",async function(label){
  await expect(this.page.getByRole("button",{name:`Blend ${label} color`,exact:true})).toHaveAttribute("aria-pressed","false");
});
