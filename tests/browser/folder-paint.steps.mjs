// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import sharp from "sharp";

const tree = page => page.getByRole("tree", { name: "Repository files", exact: true });
const directory = (page, path) => tree(page).getByRole("treeitem", { name: path, exact: true });

async function settleSidebar(page) {
  const viewport = page.viewportSize();
  await page.mouse.move(viewport.width - 1, viewport.height - 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.locator(".sidebar").evaluate(async sidebar => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await Promise.all(sidebar.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function sidebarPixels(world, name) {
  await settleSidebar(world.page);
  const png = await world.page.locator(".sidebar").screenshot({ path: join(world.artifactDirectory, `${name}.png`) });
  const decoded = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { png, ...decoded };
}

async function measureCollapse(folder) {
  // Observe real animation frames without pausing, finishing, or replacing the slide.
  const probe = await folder.locator(':scope > [role="group"]').evaluateHandle(group => {
    let complete;
    const finished = new Promise(resolve => { complete = resolve; });
    const measurement = { expandedHeight: group.getBoundingClientRect().height, heights: [], animated: false };
    group.parentElement.addEventListener("click", () => {
      const sample = () => {
        if (!group.isConnected) return complete(measurement);
        measurement.animated ||= group.getAnimations().some(animation =>
          animation.effect.getTiming().duration > 0
          && animation.effect.getKeyframes().some(frame => "height" in frame));
        measurement.heights.push(group.getBoundingClientRect().height);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { once: true });
    return { finished };
  });
  try {
    await folder.locator(":scope > .tree-row").click();
    await expect(folder.locator('[role="group"]')).toHaveCount(0);
    return await probe.evaluate(probe => probe.finished);
  } finally {
    await probe.dispose();
  }
}

When("I import a deeply nested folder for paint checks", async function () {
  const root = join(this.artifactDirectory, "folder-paint-project");
  const nested = join(root, "source", "nested", "deep");
  await mkdir(nested, { recursive: true });
  await writeFile(join(root, "README.md"), "# Folder paint regression\n");
  await Promise.all(Array.from({ length: 12 }, (_, index) =>
    writeFile(join(nested, `module${index}.ts`), `export const value = ${index};\n`)));
  await this.page.getByLabel("Import directory", { exact: true }).setInputFiles(root);
  await expect(directory(this.page, "source")).toHaveAttribute("aria-expanded", "false");
  await expect(this.page.getByRole("status", { name: "Persistence status", exact: true })).toHaveText("All changes saved");
});

Given("the collapsed sidebar pixels are recorded", async function () {
  await expect(tree(this.page).locator('[role="group"]')).toHaveCount(0);
  this.collapsedSidebar = await sidebarPixels(this, "folder-paint-before");
});

When("I expand and collapse the nested folders six times", async function () {
  for (let cycle = 0; cycle < 6; cycle += 1) {
    for (const path of ["source", "source/nested", "source/nested/deep"]) {
      const folder = directory(this.page, path);
      if (await folder.getAttribute("aria-expanded") === "false") {
        await folder.locator(":scope > .tree-row").click();
      }
    }
    if (cycle === 0) {
      await settleSidebar(this.page);
      this.folderCollapse = await measureCollapse(directory(this.page, "source"));
    } else {
      // Exercise completed expansion as well as reversal during the opening slide.
      if (cycle % 2 === 0) await settleSidebar(this.page);
      else await this.page.waitForTimeout(15);
      await directory(this.page, "source").locator(":scope > .tree-row").click();
    }
    await expect(directory(this.page, "source")).toHaveAttribute("aria-expanded", "false");
    await expect(tree(this.page).locator('[role="group"]')).toHaveCount(0);
  }
});

Then("the folder collapse visibly slides before removing its subtree", async function () {
  const { animated, expandedHeight, heights } = this.folderCollapse;
  assert.equal(animated, true, "The folder animates its height with motion enabled");
  assert.ok(heights.some(height => height > 0.1 && height < expandedHeight - 0.1),
    `Collapse must paint an intermediate height: ${JSON.stringify({ expandedHeight, heights })}`);
  await expect(tree(this.page).locator('[role="group"]')).toHaveCount(0);
  await expect(tree(this.page).getByRole("treeitem")).toHaveCount(2);
});

Then("the collapsed sidebar exactly matches its original pixels", async function () {
  const before = this.collapsedSidebar;
  const after = await sidebarPixels(this, "folder-paint-after");
  assert.deepEqual(after.info, before.info, "The sidebar keeps the same image dimensions and channels");
  let differentPixels = 0;
  for (let index = 0; index < before.data.length; index += before.info.channels) {
    if (!before.data.subarray(index, index + before.info.channels)
      .equals(after.data.subarray(index, index + after.info.channels))) differentPixels += 1;
  }
  if (differentPixels > 0) {
    await this.attach(before.png, "image/png");
    await this.attach(after.png, "image/png");
  }
  assert.equal(differentPixels, 0, "Collapsing folders must leave no stray pixels behind in the sidebar");
});
