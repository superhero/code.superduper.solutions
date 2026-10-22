// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Then } from "@cucumber/cucumber";
import { renderLicenseNotices } from "../../build/license-notices.mjs";

Then("the browser retains the complete license notices in an inert template", async function () {
  const notices = await this.page.evaluate(() => {
    const templates = [...document.querySelectorAll("template#license-notices")];
    const template = templates[0];
    return {
      count: templates.length,
      text: Object.fromEntries([...template.content.querySelectorAll("pre[data-license-source]")].map(pre => [pre.dataset.licenseSource, pre.textContent])),
      activeElements: template.content.querySelectorAll("script, img, link, style, iframe").length,
      displayedNotices: document.querySelectorAll("[data-license-source]").length,
      leakedLicenseHeadings: document.querySelectorAll("#license-notices h1").length,
    };
  });
  assert.equal(notices.count, 1);
  assert.equal(notices.activeElements, 0);
  assert.equal(notices.displayedNotices, 0);
  assert.equal(notices.leakedLicenseHeadings, 0);
  for (const path of ["LICENSE", "LICENSE-ADDITIONAL-TERMS", "src/assets/fonts/Montserrat-OFL.txt", "src/assets/fonts/Rationale-OFL.txt", "src/assets/fonts/Material-Symbols-Apache-2.0.txt", "src/lib/components/ui/LICENSE.shadcn-svelte"]) {
    assert.equal(notices.text[path], (await readFile(path, "utf8")).trim());
  }
  assert.ok(Object.keys(notices.text).some(source => source.startsWith("npm:svelte@")));
  assert.ok(Object.keys(notices.text).some(source => source.startsWith("npm:@visulima/pail@")));
});

Then("markup-like notice text stays inert when parsed by the browser", async function () {
  const text = '</pre></template><script>globalThis.noticeExecuted = true</script><img id="notice-probe" src="https://notice.invalid/probe"> & copyright';
  const html = renderLicenseNotices([{ source: "fixture", title: "Fixture notice", text }]);
  const parsed = await this.page.evaluate(html => {
    const wrapper = document.createElement("div");
    document.body.append(wrapper);
    wrapper.innerHTML = html;
    const template = wrapper.querySelector("template");
    const result = {
      text: template.content.querySelector("pre").textContent,
      activeElements: template.content.querySelectorAll("script, img").length,
      leakedElements: wrapper.querySelectorAll("script, img").length,
      executed: typeof globalThis.noticeExecuted !== "undefined",
      visibleText: wrapper.innerText,
    };
    wrapper.remove();
    return result;
  }, html);
  assert.deepEqual(parsed, { text, activeElements: 0, leakedElements: 0, executed: false, visibleText: "" });
});
