// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";

async function parameters(root, expected, linked = true) {
  await expect(root.locator(".cm-function-parameter")).toHaveText(expected);
  const result=await root.evaluate(element=>{
    const canvas=document.createElement("canvas");canvas.width=canvas.height=1;
    const drawing=canvas.getContext("2d",{willReadFrequently:true});
    const color=value=>{drawing.clearRect(0,0,1,1);drawing.fillStyle=value;drawing.fillRect(0,0,1,1);return [...drawing.getImageData(0,0,1,1).data];};
    const probe=document.createElement("span");element.append(probe);
    const role=id=>{probe.style.color=`var(--syntax-${id})`;return color(getComputedStyle(probe).color);};
    try{return {foreground:role("parameterText"),declaration:role("function"),number:role("number"),
      parameters:[...element.querySelectorAll(".cm-function-parameter")].map(node=>{
        const range=document.createRange();range.selectNodeContents(node);const styles=getComputedStyle(node);
        return {background:color(styles.backgroundColor),image:styles.backgroundImage,before:getComputedStyle(node,"::before").content,fill:getComputedStyle(node,"::before").backgroundColor,foreground:color(styles.color),
          width:node.getBoundingClientRect().width,textWidth:range.getBoundingClientRect().width};
      })};}finally{probe.remove();}
  });
  if(linked)result.foreground.forEach((channel,index)=>assert.ok(Math.abs(channel-(result.declaration[index]+result.number[index])/2)<=1,
    "Parameter text mixes function and number colors equally"));
  for(const parameter of result.parameters){
    assert.deepEqual(parameter.background,[0,0,0,0]);
    assert.equal(parameter.image,"none");assert.equal(parameter.before,'""');
    assert.notEqual(parameter.fill,"rgba(0, 0, 0, 0)");
    assert.deepEqual(parameter.foreground,result.foreground);
    assert.ok(Math.abs(parameter.width-parameter.textWidth)<.5,"Parameter styling adds no layout width");
  }
}

Then("function parameters use mixed text with shared background pills for names {string}",async function(names){
  this.functionParameterNames=names.split(" ");
  await parameters(this.page.locator(".cm-editor"),this.functionParameterNames);
  await mkdir(this.artifactDirectory,{recursive:true});
  await this.page.screenshot({path:join(this.artifactDirectory,"function-parameters.png")});
});

Then("function parameter colors use their independent mappings for names {string}",async function(names){
  await parameters(this.page.locator(".cm-editor"),names.split(" "),false);
});

Then("both diff panes retain the function parameter text styling",async function(){
  const diff=this.page.getByRole("region",{name:"File diff",exact:true});
  for(const side of ["a","b"])await parameters(diff.locator(`.cm-merge-${side}`),this.functionParameterNames);
});

Then("ordinary function parameter styling is absent",async function(){
  await expect(this.page.locator(".cm-function-parameter")).toHaveCount(0);
});

async function selectParameter(page,content,root){
  await content.focus();await page.keyboard.press("ControlOrMeta+Home");
  const before=await root.locator(".cm-function-parameter").first().boundingBox();
  for(let index=0;index<17;index++)await page.keyboard.press("ArrowRight");
  for(let index=0;index<2;index++)await page.keyboard.press("Shift+ArrowRight");
  const selected=root.locator(".cm-scope-selection");
  await expect(selected).toHaveText("al");
  await expect(selected).toHaveCSS("text-shadow","none");
  await expect(root.locator(".cm-function-parameter").first()).not.toHaveCSS("text-shadow","none");
  const fill=root.locator(".cm-joinedSelectionLayer .cm-selectionBackground");
  await expect(fill).toHaveCount(1);
  const appearance=await root.evaluate(element=>{
    const marker=element.querySelector(".cm-function-parameter"),probe=document.createElement("span");
    probe.style.backgroundColor="var(--color-editor-selection-background)";element.append(probe);
    const expected=getComputedStyle(probe).backgroundColor;probe.remove();
    return {expected,actual:getComputedStyle(element.querySelector(".cm-joinedSelectionLayer .cm-selectionBackground")).backgroundColor,
      background:getComputedStyle(marker).backgroundColor,image:getComputedStyle(marker).backgroundImage,
      native:getComputedStyle(marker,"::selection").backgroundColor};
  });
  assert.equal(appearance.actual,appearance.expected);
  assert.equal(appearance.background,"rgba(0, 0, 0, 0)");assert.equal(appearance.image,"none");
  assert.equal(appearance.native,"rgba(0, 0, 0, 0)");
  assert.equal(await page.evaluate(()=>getSelection()?.toString()),"al");
  const after=await root.locator(".cm-function-parameter").first().boundingBox();
  for(const key of ["x","y","height"])assert.ok(Math.abs(after[key]-before[key])<.5,
    `Painting a partial selection preserves parameter geometry (${key})`);
  await page.keyboard.press("ArrowRight");
  await expect(selected).toHaveCount(0);
  await parameters(root,["value","value"]);
  await expect(root.locator(".cm-function-parameter").first()).not.toHaveCSS("text-shadow","none");
}

Then("selecting part of a parameter keeps the selection visible in the editor",async function(){
  await selectParameter(this.page,this.page.getByLabel("Code editor document",{exact:true}),this.page.locator(".cm-editor"));
});

Then("selecting part of a parameter keeps the selection visible in both diff panes",async function(){
  const diff=this.page.getByRole("region",{name:"File diff",exact:true});
  for(const [side,label] of [["a","Committed file"],["b","Current file"]])
    await selectParameter(this.page,diff.getByLabel(label,{exact:true}),diff.locator(`.cm-merge-${side}`));
});

When("I prepare many ordinary functions for the parameter minimap",async function(){
  const editor=this.page.getByLabel("Code editor document",{exact:true});await editor.focus();
  await this.page.keyboard.insertText(Array.from({length:180},(_,index)=>`function render${index}(input) { return input; }`).join("\n"));
  await expect(this.page.getByRole("status",{name:"Persistence status",exact:true})).toHaveText("All changes saved");
  await this.page.keyboard.press("ControlOrMeta+Home");
});

Then("the minimap paints parameter backgrounds below their text glyphs",async function(){
  const root=this.page.locator(".cm-editor");
  await expect(root.locator(".cm-minimap-inner canvas")).toBeVisible();
  await expect.poll(()=>root.evaluate(element=>{
    const marker=element.querySelector(".cm-function-parameter"),line=marker.closest(".cm-line"),range=document.createRange();
    range.selectNodeContents(line);const text=range.getBoundingClientRect(),box=marker.getBoundingClientRect();
    const rowHeight=line.getBoundingClientRect().height/8;
    const top=parseFloat(getComputedStyle(element.querySelector(".cm-content")).paddingTop)/8;
    const x=Math.floor((4+(box.left-text.left)/5+box.width/10)*2),y=Math.floor((top+rowHeight)*2)-1;
    const canvas=element.querySelector(".cm-minimap-inner canvas"),actual=[...canvas.getContext("2d").getImageData(x,y,1,1).data];
    const sample=document.createElement("canvas");sample.width=sample.height=1;
    const drawing=sample.getContext("2d",{willReadFrequently:true});drawing.fillStyle=getComputedStyle(marker).getPropertyValue("--cm-token-background");drawing.fillRect(0,0,1,1);
    const expected=[...drawing.getImageData(0,0,1,1).data];
    return actual.every((value,index)=>value===expected[index]);
  })).toBe(true);
});

Then("method parameters have translucent pane pills in the editor and diff",async function(){
  const verify=async root=>{
    await expect(root.locator(".cm-method-parameter, .cm-function-parameter")).toHaveText(["input","input","value","value","plain","plain","arrow","arrow","bare","bare","expression","expression"]);
    const appearances=await root.locator(".cm-method-parameter, .cm-function-parameter").evaluateAll(nodes=>nodes.map(node=>{
      const fill=getComputedStyle(node,"::before"),probe=document.createElement("span");
      probe.style.color="color-mix(in srgb, var(--color-surface) 80%, transparent)";node.append(probe);
      const expected=getComputedStyle(probe).color;probe.remove();
      return {background:fill.backgroundColor,expected,radius:fill.borderRadius,top:fill.top,bottom:fill.bottom};
    }));
    for(const fill of appearances){assert.equal(fill.background,fill.expected);assert.equal(fill.radius,"6px");assert.equal(fill.top,"2px");assert.equal(fill.bottom,"2px");}
  };
  await verify(this.page.locator(".cm-editor"));
  await this.page.getByRole("button",{name:"Open file diff",exact:true}).click();
  const diff=this.page.getByRole("region",{name:"File diff",exact:true});
  for(const side of ["a","b"])await verify(diff.locator(`.cm-merge-${side}`));
});

Then("calls keep normal name pills and shadow-free parentheses in editor and diff",async function(){
  const verify=async root=>{
    await expect(root.locator(".cm-called-argument, .cm-call-pill")).toHaveCount(0);
    const pills=await root.locator(".cm-function-parameter, .cm-method-parameter, .cm-scope-parent").evaluateAll(nodes=>nodes.map(node=>{
      const fill=getComputedStyle(node,"::before");return {text:node.textContent,radius:fill.borderRadius,mask:fill.maskImage,called:node.classList.contains("cm-call-name")};
    }));
    for(const pill of pills){assert.equal(pill.radius,"6px");assert.equal(pill.mask,"none");assert.ok(!pill.text.includes("("));}
    await expect(root.locator(".cm-call-close")).toHaveText([")",")",")",")"]);
    await expect(root.locator(".cm-call-open")).toHaveText(["(","(","(","("]);
    const opening=root.locator(".cm-call-open").first();
    const openColor=await opening.evaluate(node=>getComputedStyle(node).color);
    assert.notEqual(openColor,"rgba(0, 0, 0, 0)");
    await expect(opening).toHaveCSS("text-shadow","none");
    await expect(root.locator(".cm-call-close").first()).toHaveCSS("font-weight","400");
    await expect(root.locator(".cm-call-close").first()).toHaveCSS("text-shadow","none");
    await root.locator(".cm-content").focus();
    await this.page.keyboard.press("ControlOrMeta+Home");
    for(let index=0;index<"function invoke(callback) { callback(".length;index++)await this.page.keyboard.press("ArrowRight");
    if(await root.locator(".cm-matchingBracket").count()){
      await expect(root.locator(".cm-call-close").first()).toHaveCSS("font-weight","400");
    await expect(root.locator(".cm-call-close").first()).toHaveCSS("text-shadow","none");
    }
    await this.page.keyboard.press("Shift+ArrowLeft");
    assert.equal(await this.page.evaluate(()=>getSelection()?.toString()),"(");
    await expect(opening).toHaveCSS("text-shadow","none");
    await this.page.keyboard.press("ArrowRight");
    await this.page.keyboard.press("ArrowRight");
    await this.page.keyboard.press("Shift+ArrowLeft");
    assert.equal(await this.page.evaluate(()=>getSelection()?.toString()),")");
    await expect(root.locator(".cm-call-close").first()).toHaveCSS("font-weight","400");
    await expect(root.locator(".cm-call-close").first()).toHaveCSS("text-shadow","none");
    await this.page.keyboard.press("ControlOrMeta+End");
    await expect(root.locator(".cm-call-close").first()).toHaveCSS("font-weight","400");
    await expect(root.locator(".cm-call-close").first()).toHaveCSS("text-shadow","none");
  };
  await verify(this.page.locator(".cm-editor"));
  await this.page.getByRole("button",{name:"Open file diff",exact:true}).click();
  const diff=this.page.getByRole("region",{name:"File diff",exact:true});
  for(const side of ["a","b"])await verify(diff.locator(`.cm-merge-${side}`));
});
