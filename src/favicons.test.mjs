// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Then } from "@cucumber/cucumber";
import sharp from "sharp";
import { faviconFiles, generateFavicons } from "../build/favicons.mjs";

Then("the page offers crawlable raster icons and an embedded SVG", async function () {
  const html = await readFile("dist/index.html", "utf8");
  const icons = [...html.matchAll(/<link\b[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(match =>
    Object.fromEntries([...match[0].matchAll(/\b([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])));
  assert.equal(icons.length, 4);
  assert.deepEqual(icons.slice(0, 2), [
    { rel: "icon", type: "image/x-icon", sizes: "16x16 32x32 48x48", href: "./favicon.ico" },
    { rel: "icon", type: "image/png", sizes: "96x96", href: "./favicon.png" },
  ]);
  assert.equal(icons[2].rel, "icon"); assert.equal(icons[2].type, "image/svg+xml"); assert.equal(icons[2].sizes, "any");
  assert.match(icons[2].href, /^data:image\/svg\+xml/);
  assert.deepEqual(icons[3], { rel: "apple-touch-icon", type: "image/png", sizes: "180x180", href: "./apple-touch-icon.png" });
  const encoded = icons[2].href.split(",").slice(1).join(",");
  const svg = icons[2].href.split(",")[0].includes(";base64") ? Buffer.from(encoded, "base64").toString() : decodeURIComponent(encoded);
  const embedded = await sharp(Buffer.from(svg)).png().toBuffer();
  const hosted = await sharp(await readFile("dist/favicon.svg")).png().toBuffer();
  assert.deepEqual(embedded, hosted);
});

Then("the hosted {string} favicon has a valid {string} image", async function (filename, format) {
  const file = await readFile(join("dist", filename));
  assert.ok(file.length > 0);
  assert.deepEqual(file, await readFile(join("src/public", filename)));
  if (["png", "gif", "jpeg", "tiff", "svg"].includes(format)) {
    const metadata = await sharp(file).metadata();
    const size = filename === "apple-touch-icon.png" ? 180 : format === "svg" ? 64 : 96;
    assert.equal(metadata.format, format); assert.equal(metadata.width, size); assert.equal(metadata.height, size);
    assert.equal(metadata.pages ?? 1, 1);
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.channels, 4);
    assert.ok(new Set(data).size > 8, "The image must contain visible artwork, not an empty placeholder.");
    if (format === "svg") assert.deepEqual(file, await readFile("src/assets/favicon.svg"));
  } else if (format === "ico") {
    assert.equal(file.readUInt16LE(0), 0); assert.equal(file.readUInt16LE(2), 1); assert.equal(file.readUInt16LE(4), 3);
    const ranges = [];
    for (let index = 0; index < 3; index++) {
      const entry = 6 + index * 16, size = [16, 32, 48][index];
      assert.equal(file[entry], size); assert.equal(file[entry + 1], size);
      assert.equal(file.readUInt16LE(entry + 4), 1); assert.equal(file.readUInt16LE(entry + 6), 32);
      const length = file.readUInt32LE(entry + 8), offset = file.readUInt32LE(entry + 12);
      assert.ok(offset >= 54 && offset + length <= file.length);
      const dib = file.subarray(offset, offset + length);
      assert.equal(dib.readUInt32LE(0), 40); assert.equal(dib.readInt32LE(4), size);
      assert.equal(dib.readInt32LE(8), size * 2); assert.equal(dib.readUInt16LE(14), 32);
      assert.equal(dib.readUInt32LE(16), 0);
      assert.equal(length, 40 + size * size * 4 + Math.ceil(size / 32) * 4 * size);
      assert.ok(dib.subarray(40, 40 + size * size * 4).some(byte => byte !== 0));
      ranges.push([offset, offset + length]);
    }
    assert.equal(ranges[0][0], 54);
    assert.equal(ranges[0][1], ranges[1][0]); assert.equal(ranges[1][1], ranges[2][0]); assert.equal(ranges[2][1], file.length);
  } else {
    const expected = await sharp(await readFile("dist/favicon.png")).flatten({ background: "#eee9df" }).removeAlpha().raw().toBuffer();
    if (format === "ppm") {
      const header = Buffer.from("P6\n96 96\n255\n");
      assert.deepEqual(file.subarray(0, header.length), header);
      assert.deepEqual(file.subarray(header.length), expected);
    } else {
      assert.equal(format, "bmp"); assert.equal(file.toString("ascii", 0, 2), "BM");
      assert.equal(file.readUInt32LE(2), file.length); assert.equal(file.readUInt32LE(10), 54);
      assert.equal(file.readUInt32LE(14), 40); assert.equal(file.readInt32LE(18), 96); assert.equal(file.readInt32LE(22), 96);
      assert.equal(file.readUInt16LE(26), 1); assert.equal(file.readUInt16LE(28), 24); assert.equal(file.readUInt32LE(30), 0);
      assert.equal(file.length, 54 + 96 * 96 * 3);
      const decoded = Buffer.alloc(expected.length);
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const start = 54 + ((95 - y) * 96 + x) * 3, target = (y * 96 + x) * 3;
        decoded[target] = file[start + 2]; decoded[target + 1] = file[start + 1]; decoded[target + 2] = file[start];
      }
      assert.deepEqual(decoded, expected);
    }
  }
});

Then("the favicon check rejects {string} without rewriting assets", async function (failure) {
  const root = await mkdtemp(join(tmpdir(), "favicon-check-"));
  try {
    const source = join(root, "favicon.svg"), destination = join(root, "public");
    const svg = await readFile("src/assets/favicon.svg", "utf8"); await writeFile(source, svg);
    await generateFavicons({ source, destination });
    if (failure === "missing output") await rm(join(destination, "favicon.png"));
    else if (failure === "changed output") await writeFile(join(destination, "favicon.png"), "stale output");
    else if (failure === "changed source") await writeFile(source, svg.replace('rx="14"', 'rx="8"'));
    else assert.fail(`Unknown favicon failure: ${failure}`);
    const snapshot = await Promise.all(faviconFiles.map(name => readFile(join(destination, name)).catch(error => {
      if (error.code !== "ENOENT") throw error; return null;
    })));
    await assert.rejects(generateFavicons({ source, destination, check: true }), /missing or stale.*icons:generate/);
    assert.deepEqual(await Promise.all(faviconFiles.map(name => readFile(join(destination, name)).catch(error => {
      if (error.code !== "ENOENT") throw error; return null;
    }))), snapshot);
  } finally { await rm(root, { recursive: true, force: true }); }
});

Then("favicon generation refuses a {string} before changing existing assets", async function (failure) {
  const root = await mkdtemp(join(tmpdir(), "favicon-destination-"));
  try {
    const destination = join(root, "public"), source = join(root, "favicon.svg");
    await writeFile(source, await readFile("src/assets/favicon.svg")); await mkdir(destination);
    await writeFile(join(destination, "apple-touch-icon.png"), "preserve this existing file");
    if (failure === "symlink") { await writeFile(join(root, "outside"), "outside"); await symlink(join(root, "outside"), join(destination, "favicon.tiff")); }
    else if (failure === "directory") await mkdir(join(destination, "favicon.tiff"));
    else assert.fail(`Unknown destination failure: ${failure}`);
    await assert.rejects(generateFavicons({ source, destination }), /not a regular file/);
    assert.equal(await readFile(join(destination, "apple-touch-icon.png"), "utf8"), "preserve this existing file");
    if (failure === "symlink") assert.equal(await readFile(join(root, "outside"), "utf8"), "outside");
  } finally { await rm(root, { recursive: true, force: true }); }
});
