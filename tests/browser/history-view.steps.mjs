// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { openStagedHistory } from "./navigation.helpers.mjs";

const graphSelector = page => page.getByRole("navigation", {name:"History views",exact:true});
const graphList = (page, name) => page.getByRole("list", { name, exact: true, includeHidden: true });
const graphValues = { "Staged changes": "Staged", "Commit history": "Committed" };
const saved = page => expect(page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");

When("I select the history graph {string}", async function (name) {
  assert.ok(name in graphValues);
  await saved(this.page);
  await graphSelector(this.page).getByRole("button",{name:graphValues[name],exact:true}).click();
  await saved(this.page);
});

Then("the selected history graph is {string}", async function (name) {
  assert.ok(name in graphValues);
  await saved(this.page);
  await expect(graphSelector(this.page).getByRole("button",{name:graphValues[name],exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(graphSelector(this.page).locator('[aria-pressed="true"]')).toHaveCount(1);
  const changes = graphList(this.page, "Staged changes");
  const versions = graphList(this.page, "Commit history");
  await expect(name === "Staged changes" ? changes : versions).toBeVisible();
  await expect(name === "Staged changes" ? versions : changes).toBeHidden();
  await expect(this.page.getByLabel("Commit message", { exact: true })).toHaveCount(0);
  await expect(this.page.getByRole("button", { name: "Create commit", exact: true })).toHaveCount(0);

});

Then("the version graph shows the source commit {string}", async function (message) {
  const graph = graphList(this.page, "Commit history");
  await expect(graph).toBeVisible();
  await expect(graph).toContainText(message);
  await expect(graph.locator(".commit-node")).toHaveCount(1);
  await expect(graph.locator('li[aria-current="true"]')).toContainText(message);
});

When("I close the History pane", async function () {
  await this.page.getByRole("button", {name:"Close History",exact:true}).click();
  await expect(this.page.locator('[data-history-panel]')).toHaveCount(0);
});

Then("the History graph tabs are absent", async function () {
  await expect(graphSelector(this.page)).toHaveCount(0);
});

Then("history navigation fits wide and narrow headers", async function () {
  await mkdir(this.artifactDirectory, { recursive: true });
  for (const width of [1280, 390]) {
    await this.page.setViewportSize({ width, height: 900 });
    const trigger = graphSelector(this.page);
    await expect(trigger).toBeVisible();
    const button = await trigger.boundingBox();
    assert.ok(button && button.x >= 0 && button.x + button.width <= width);
    const graph = await graphList(this.page, "Commit history").boundingBox();
    const contentLeft = await this.page.locator(".history-page").evaluate(element =>
      element.getBoundingClientRect().left + parseFloat(getComputedStyle(element).paddingLeft));
    assert.ok(graph && Math.abs(graph.x - contentLeft) < 1 && graph.x + graph.width <= width,
      "The graph aligns with the history page's content edge and fits the viewport without a card inset");
    const screenshot = await this.page.screenshot({ path: join(this.artifactDirectory, `history-navigation-${width}.png`) });
    await this.attach(screenshot, "image/png");
  }
});

When('I undo into the middle of the staged history', {timeout:60_000}, async function () {
  for (let index=0;index<20;index++) {
    const current=this.page.locator('#panel-history li[aria-current="true"]').first();
    const oid=await current.getAttribute('data-oid');
    await this.page.getByRole('button',{name:'Undo',exact:true}).click();
    await expect(current).not.toHaveAttribute('data-oid',oid);
    await expect(this.page.locator('#panel-history li[aria-current="true"] .change-load')).toBeFocused();
  }
});
Then('the restored staged revision is centered, focused and highlighted',async function () {
  const row=this.page.locator('#panel-history li[aria-current="true"]');
  await expect(row.locator('.change-load')).toBeFocused();
  const geometry=await row.evaluate(node=>{
    const panel=document.getElementById('panel-history');
    const bounds=node.getBoundingClientRect(),viewport=panel.getBoundingClientRect();
    return {distance:Math.abs(bounds.top+bounds.height/2-viewport.top-panel.clientTop-panel.clientHeight/2),
      background:getComputedStyle(node,"::before").backgroundColor,
      siblingBackground:getComputedStyle(node.nextElementSibling,"::before").backgroundColor};
  });
  assert.ok(geometry.distance<2,JSON.stringify(geometry));
  assert.notEqual(geometry.background,geometry.siblingBackground);
});
Then('Tab continues from the restored staged revision',async function () {
  const next=this.page.locator('#panel-history li[aria-current="true"] + li .change-load');
  await this.page.keyboard.press('Tab');
  await expect(next).toBeFocused();
});

Then('History slides beside the editor with independent resizing and restoration', {timeout:90000}, async function () {
  const page=this.page;
  await page.setViewportSize({width:2000,height:980});
  await expect(page.getByRole('button',{name:'Page',exact:true})).toHaveCount(0);
  await openStagedHistory(page);
  const history=()=>page.locator('[data-history-panel]');
  const editor=()=>page.getByRole('region',{name:'Editor',exact:true});
  await expect(history()).toBeVisible();await expect(editor()).toBeVisible();
  await expect(page.locator('.topbar').getByRole('heading',{name:'Editor',exact:true})).toBeVisible();
  const divider=page.getByRole('separator',{name:'Resize History pane',exact:true});
  await expect(divider).toBeVisible();
  await expect(divider).toHaveAttribute('aria-disabled','false');
  const initial=Math.round((await history().boundingBox()).width);
  await divider.focus();await divider.press('ArrowLeft');await saved(page);
  await expect.poll(async()=>Math.round((await history().boundingBox()).width)).toBe(initial+16);
  await page.reload();await saved(page);
  await expect(history()).toBeVisible();await expect(editor()).toBeVisible();
  await expect.poll(async()=>Math.round((await history().boundingBox()).width)).toBe(initial+16);
  const versionTab=graphSelector(page).getByRole("button",{name:"Committed",exact:true});await versionTab.focus();await versionTab.press("Enter");await saved(page);
  await page.getByRole('button',{name:'Git operations',exact:true}).click();
  await page.getByRole('button',{name:'AI chat',exact:true}).click();
  const git=()=>page.locator('[data-git-panel]');
  const ai=()=>page.getByRole('button',{name:'Close AI',exact:true});
  await expect(history()).toBeVisible();await expect(git()).toBeVisible();await expect(ai()).toBeVisible();await expect(editor()).toBeVisible();
  const geometry=await history().evaluate(element=>{
    const git=document.querySelector('[data-git-panel]');
    const historyHeader=element.querySelector('header').getBoundingClientRect();
    const gitHeader=git.querySelector('header').getBoundingClientRect();
    const historyToolbar=element.querySelector('.history-actions'),gitToolbar=git.querySelector('.git-context');
    return {border:getComputedStyle(element).borderLeftWidth,header:historyHeader.height,gitHeader:gitHeader.height,
      toolbar:historyToolbar.getBoundingClientRect().height,gitToolbar:gitToolbar.getBoundingClientRect().height,
      color:getComputedStyle(historyToolbar).backgroundColor,gitColor:getComputedStyle(gitToolbar).backgroundColor,
      tabs:element.querySelector('.history-tabs').getBoundingClientRect().y,gitTabs:git.querySelector('.git-tabs').getBoundingClientRect().y};
  });
  assert.equal(geometry.border,'2px');assert.equal(geometry.header,geometry.gitHeader);
  assert.equal(geometry.toolbar,geometry.gitToolbar);assert.equal(geometry.color,geometry.gitColor);assert.equal(geometry.tabs,geometry.gitTabs);
  const h=await history().boundingBox(),g=await git().boundingBox(),a=await ai().boundingBox();
  assert.ok(g.x>=h.x+h.width-2);assert.ok(a.x>=g.x+g.width-2);
  await saved(page);await page.reload();await saved(page);
  await expect(history()).toBeVisible();await expect(git()).toBeVisible();await expect(ai()).toBeVisible();
  await expect(graphSelector(page).getByRole('button',{name:'Committed',exact:true})).toHaveAttribute('aria-pressed','true');
  await this.attach(await page.screenshot({path:join(this.artifactDirectory,'history-git-ai-desktop.png')}),'image/png');
  await page.setViewportSize({width:600,height:980});
  await expect(history()).toHaveCount(0);await expect(git()).toHaveCount(0);await expect(ai()).toBeVisible();
  await expect(editor()).toBeVisible();
  await this.attach(await page.screenshot({path:join(this.artifactDirectory,'history-git-ai-compact.png')}),'image/png');
  await ai().click();
  await expect(editor()).toBeVisible();await expect(page.getByLabel('Code editor document',{exact:true})).toContainText('history fixture');
});
