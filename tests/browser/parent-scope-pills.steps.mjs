// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

Then("only these references have parent scope pills: {string}", async function (names) {
  await expect(this.page.locator(".cm-editor .cm-scope-parent")).toHaveText(names ? names.split(" ") : []);
});

Then("both diff panes keep only these parent scope pills: {string}", async function (names) {
  const diff = this.page.getByRole("region", { name: "File diff", exact: true });
  for (const side of ["a", "b"])
    await expect(diff.locator(`.cm-merge-${side} .cm-scope-parent`)).toHaveText(names ? names.split(" ") : []);
});

Then("only these references have global scope pills: {string}", async function (names) {
  await expect(this.page.locator(".cm-editor .cm-scope-global")).toHaveText(names ? names.split(" ") : []);
});

Then("both diff panes keep only these global scope pills: {string}", async function (names) {
  const diff = this.page.getByRole("region", { name: "File diff", exact: true });
  for (const side of ["a", "b"])
    await expect(diff.locator(`.cm-merge-${side} .cm-scope-global`)).toHaveText(names ? names.split(" ") : []);
});

async function scopePills(page, root, content, scope, name) {
  const pills = root.locator(`.cm-scope-${scope}`);
  await expect(pills).toHaveText([name, name]);
  const styles = await pills.first().evaluate((node, scope) => {
    const style = getComputedStyle(node), fill = getComputedStyle(node, "::before");
    const probe = document.createElement("span"); node.parentElement.append(probe);
    const color = variable => { probe.style.color = `var(${variable})`; return getComputedStyle(probe).color; };
    const expectedBackground = color(`--syntax-${scope}`), expectedText = color(`--syntax-${scope}Text`);
    probe.style.color = fill.backgroundColor;
    const background = getComputedStyle(probe).color;
    probe.remove();
    return { text: style.color, background, expectedBackground, expectedText,
      radius: fill.borderRadius, top: fill.top, bottom: fill.bottom, before: fill.content, shadow: fill.boxShadow };
  }, scope);
  assert.equal(styles.text, styles.expectedText);
  assert.equal(styles.background, styles.expectedBackground);
  assert.equal(styles.radius, "6px");
  assert.equal(styles.top, "2px"); assert.equal(styles.bottom, "2px");
  assert.equal(styles.before, '""');
  assert.ok(styles.shadow.includes("-2px 0px 0px 0px"));
  assert.ok(styles.shadow.includes("2px 0px 0px 0px"));

  await content.focus(); await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("Home");
  for (let index = 0; index < "function render() { return ".length + 1; index++) await page.keyboard.press("ArrowRight");
  const before = await pills.first().boundingBox();
  await page.keyboard.press("Shift+ArrowRight"); await page.keyboard.press("Shift+ArrowRight");
  const selection = root.locator(".cm-scope-selection");
  await expect(selection).toHaveText(name.slice(1, 3));
  assert.notEqual(await selection.evaluate(node => getComputedStyle(node).backgroundImage), "none");
  assert.equal(await page.evaluate(() => getSelection()?.toString()), name.slice(1, 3));
  const after = await pills.first().boundingBox();
  for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(before[key] - after[key]) < .5);
  await page.keyboard.press("ArrowRight");
  await expect(selection).toHaveCount(0);
}

for (const [scope, name] of [["parent", "outer"], ["global", "Math"]]) {
  Then(`${scope} scope pills retain their rounded fill and partial selections in the editor`, async function () {
    await scopePills(this.page, this.page.locator(".cm-editor"), this.page.getByLabel("Code editor document", { exact: true }), scope, name);
  });

  Then(`${scope} scope pills retain their rounded fill and partial selections in both diff panes`, async function () {
    const diff = this.page.getByRole("region", { name: "File diff", exact: true });
    for (const [side, label] of [["a", "Committed file"], ["b", "Current file"]])
      await scopePills(this.page, diff.locator(`.cm-merge-${side}`), diff.getByLabel(label, { exact: true }), scope, name);
  });
}

Then("imported pills have blended bodies and matching side shadows in editor and diff",async function(){
  const verify=async root=>{
    await expect(root.locator(".cm-scope-imported")).toHaveText(["helper","helper"]);
    const appearance=await root.locator(".cm-scope-imported").first().evaluate(node=>{
      const fill=getComputedStyle(node,"::before"),probe=document.createElement("span");node.append(probe);
      const color=name=>{probe.style.color=`var(--syntax-${name})`;return getComputedStyle(probe).color;};
      const parent=color("importedBackground"),global=color("global"),text=color("parentText");probe.remove();
      return {parent,global,text,actualText:getComputedStyle(node).color,background:fill.backgroundColor,shadow:fill.boxShadow,radius:fill.borderRadius};
    });
    assert.equal(appearance.background,appearance.parent);assert.equal(appearance.actualText,appearance.text);
    assert.equal(appearance.radius,"6px");
    assert.equal(appearance.shadow,`${appearance.parent} -2px 0px 0px 0px, ${appearance.parent} 2px 0px 0px 0px`);
    await root.locator(".cm-content").focus();await this.page.keyboard.press("ControlOrMeta+Home");
    for(let index=0;index<10;index++)await this.page.keyboard.press("ArrowRight");
    await this.page.keyboard.press("Shift+ArrowRight");await this.page.keyboard.press("Shift+ArrowRight");
    await expect(root.locator(".cm-scope-selection")).toHaveText("el");
    await expect(root.locator(".cm-scope-selection")).not.toHaveCSS("background-image","none");
    await this.page.keyboard.press("ArrowRight");await expect(root.locator(".cm-scope-selection")).toHaveCount(0);
  };
  await verify(this.page.locator(".cm-editor"));
  await this.page.getByRole("button",{name:"Open file diff",exact:true}).click();
  const diff=this.page.getByRole("region",{name:"File diff",exact:true});
  for(const side of ["a","b"])await verify(diff.locator(`.cm-merge-${side}`));
});

Then("parent constants alone are bold in editor and diff",async function(){
  const verify=async root=>{
    await expect(root.locator(".cm-parent-const")).toHaveText(["fixed","flag","text","list","nil","missing","set","map","nested","object"]);
    for(const node of await root.locator(".cm-parent-const").all())await expect(node).toHaveCSS("font-weight","700");
    await expect(root.locator(".cm-scope-parent:not(.cm-parent-const)")).toHaveText(["alias","callback","unknown","bad","instance","mutable","old"]);
    for(const node of await root.locator(".cm-scope-parent:not(.cm-parent-const)").all())await expect(node).toHaveCSS("font-weight","400");
  };
  await verify(this.page.locator(".cm-editor"));
  await this.page.getByRole("button",{name:"Open file diff",exact:true}).click();
  const diff=this.page.getByRole("region",{name:"File diff",exact:true});
  for(const side of ["a","b"])await verify(diff.locator(`.cm-merge-${side}`));
});
