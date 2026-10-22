// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { readFile } from "node:fs/promises";
import { renderLicenseNotices } from "../../build/license-notices.mjs";

const projectRoot = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path, projectRoot), "utf8");

// This is the reviewed asset inventory, not a license inference from every
// transitive development dependency. Snapshots also support CI's production-only
// coverage packaging job, where Istanbul itself is not installed.
export async function reportNotices(kind)
{
  const lock = JSON.parse(await read("package-lock.json"));
  function requireVersion(name, expected)
  {
    const actual = lock.packages[`node_modules/${name}`]?.version;
    if (actual !== expected)
      throw new Error(`Review report assets and licenses after upgrading ${name}: expected ${expected}, got ${actual}.`);
  }
  const notices = await Promise.all([
    ["LICENSE", "First-party report wrapper license"],
    ["LICENSE-ADDITIONAL-TERMS", "First-party additional terms and attribution"]
  ].map(async ([source, title]) => ({ source, title, text: await read(source) })));

  if (kind === "tests")
  {
    requireVersion("multiple-cucumber-html-reporter", "4.4.2");
    requireVersion("tailwindcss", "4.3.3");
    for (const [source, title] of [
      ["node_modules/multiple-cucumber-html-reporter/LICENSE", "multiple-cucumber-html-reporter 4.4.2 (MIT); chart-free adaptation"],
      ["node_modules/tailwindcss/LICENSE", "Tailwind CSS 4.3.3 (MIT)"],
      [".github/licenses/Font-Awesome-7.2.0-LICENSE.txt", "Font Awesome Free 7.2.0 (font and CSS licenses)"]
    ]) notices.push({ source, title, text: await read(source) });
  }
  else if (kind === "coverage")
  {
    requireVersion("istanbul-reports", "3.2.0");
    const istanbul = ".github/licenses/istanbul-reports-3.2.0-LICENSE.txt";
    const prettify = ".github/licenses/google-code-prettify-COPYING.txt";
    notices.push({ source: istanbul, title: "Istanbul reports 3.2.0 (BSD-3-Clause)", text: await read(istanbul) });
    notices.push({ source: prettify, title: "Google Code Prettify (Apache-2.0)",
      text: `Copyright (C) 2006 Google Inc.\nCopyright (C) 2015 Google Inc.\n\n${await read(prettify)}` });
  }
  else throw new Error(`Unknown report notice inventory: ${kind}`);
  return renderLicenseNotices(notices);
}
