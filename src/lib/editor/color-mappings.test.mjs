// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from "node:assert/strict";
import { Then } from "@cucumber/cucumber";
import { COLOR_ROLES, DEFAULT_COLOR_MAPPINGS, colorSources, colorMappingValues, normalizeColorMappings } from "./color-mappings.ts";
import { DEFAULT_SETTINGS, normalizeOverrides, normalizeSettings, resolveSettings } from "./settings.ts";

Then("default editor color mappings preserve the existing palette and scope mixes", function () {
  const defaults = colorMappingValues({});
  assert.equal(COLOR_ROLES.length, 23);
  assert.deepEqual(Object.keys(defaults), COLOR_ROLES.map(role => role.id));
  assert.equal(defaults.text, "var(--color-foreground)");
  assert.equal(defaults.keyword, "var(--syntax-accent-keyword)");
  assert.equal(defaults.parameterBackground, "var(--color-foreground)");
  assert.equal(defaults.parameterText, "color-mix(in srgb, var(--syntax-function) 50%, var(--syntax-number))");
  assert.equal(defaults.operator, "var(--palette-13)");
  assert.equal(defaults.dot, "var(--syntax-operator)");
  assert.equal(defaults.semicolon, "var(--syntax-operator)");
  assert.equal(defaults.global, "var(--tone-5)");
  assert.equal(defaults.globalText, "var(--color-background)");
  assert.equal(defaults.parent, "var(--color-foreground)");
  assert.equal(defaults.parentText, "var(--color-background)");
  assert.equal(defaults.imported, "var(--syntax-parentText)");
  assert.equal(defaults.importedBackground, "color-mix(in srgb, var(--color-foreground) 50%, var(--tone-5))");
  assert.equal(defaults.selection, "var(--color-foreground)");
  assert.equal(defaults.activeLine, "var(--color-surface)");
  assert.equal(colorMappingValues({ text: { source: "background" } }).text, "var(--color-background)");
  assert.equal(colorMappingValues({ parent: { source: "palette-13", mix: "role-string", weight: 25 } }).parent,
    "color-mix(in srgb, var(--palette-13) 25%, var(--syntax-string))");
  for (const [index, role] of COLOR_ROLES.entries()) {
    const choices = colorSources(role.id);
    assert.equal(new Set(choices.map(choice => choice.value)).size, choices.length);
    assert.ok(choices.some(choice => choice.value === DEFAULT_COLOR_MAPPINGS[role.id].source));
    for (const choice of choices.filter(choice => choice.value.startsWith("role-")))
      assert.ok(COLOR_ROLES.findIndex(item => item.id === choice.value.slice(5)) < index);
  }
});

Then("malformed editor color mappings cannot inject CSS or cyclic references", function () {
  for (const input of [null, false, 12, "red", []]) {
    assert.deepEqual(normalizeColorMappings(input), {});
    assert.deepEqual(normalizeOverrides({ colorMappings: input }), {});
  }
  for (const recipe of [undefined, null, 0, "palette-13", [], {}, {source: 13}, {source:"url(https://example.test)"},
    {source:"palette-0"}, {source:"palette-14"}, {source:"role-operator"}, {source:"role-parent"}])
    assert.deepEqual(normalizeColorMappings({ operator: recipe, unknown: { source: "foreground" } }), {});
  assert.deepEqual(normalizeColorMappings({ operator: { source: "palette-8", unknown: true } }), { operator: { source: "palette-8" } });
  for (const mix of [undefined, null, 12, "role-parent", "bad css"]) assert.deepEqual(normalizeColorMappings({
    operator: { source: "palette-8", mix, weight: 50 },
  }), { operator: { source: "palette-8" } });
  for (const weight of [undefined, null, "50", NaN, Infinity]) assert.deepEqual(normalizeColorMappings({
    operator: { source: "palette-8", mix: "foreground", weight },
  }), { operator: { source: "palette-8" } });
  for (const [weight, expected] of [[-10,0],[120,100],[42.6,43],[0,0],[100,100]]) assert.deepEqual(normalizeColorMappings({
    operator: { source: "palette-8", mix: "role-string", weight },
  }), { operator: { source: "palette-8", mix: "role-string", weight: expected } });
  const all = normalizeColorMappings(DEFAULT_COLOR_MAPPINGS);
  assert.deepEqual(all, DEFAULT_COLOR_MAPPINGS);
  assert.notEqual(all.operator, DEFAULT_COLOR_MAPPINGS.operator);
});

Then("editor color mappings persist and inherit by role without becoming file preferences", function () {
  const store = normalizeSettings({ version: 1,
    global: { colorMappings: { operator: {source:"palette-9"}, parent: {source:"role-string",mix:"foreground",weight:60} } },
    repositories: { one: { colorMappings: { semicolon: {source:"palette-8"} } } },
    files: { one: { "main.js": { colorMappings: { operator: {source:"palette-10"} } } } },
  });
  const before = structuredClone(store);
  assert.deepEqual(resolveSettings(store,"one").colorMappings, { ...store.global.colorMappings, semicolon:{source:"palette-8"} });
  assert.deepEqual(resolveSettings(store,"other").colorMappings, store.global.colorMappings);
  assert.deepEqual(resolveSettings(store,"one","main.js").colorMappings, resolveSettings(store,"one").colorMappings);
  assert.equal(Object.hasOwn(store,"files"), false);
  assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(store))), store);
  assert.deepEqual(store, before);
  store.global.colorMappings.operator = {source:"palette-13"};
  assert.equal(resolveSettings(store,"one").colorMappings.operator.source, "palette-13");
  assert.equal(resolveSettings(store,"one").colorMappings.semicolon.source, "palette-8");
  assert.notEqual(normalizeSettings(null).global.colorMappings, DEFAULT_SETTINGS.colorMappings);
});

Then("selection opacity validates and inherits independently of color mappings", function () {
  assert.equal(normalizeSettings(null).global.selectionOpacity, 20);
  for (const [value, expected] of [[-1,0],[101,100],[33.6,34]]) assert.deepEqual(normalizeOverrides({selectionOpacity:value}), {selectionOpacity:expected});
  for (const value of [null, "20", false, NaN, Infinity]) assert.deepEqual(normalizeOverrides({selectionOpacity:value}), {});
  const store = normalizeSettings({global:{selectionOpacity:35},repositories:{one:{selectionOpacity:50}},files:{one:{"main.js":{selectionOpacity:90}}}});
  assert.equal(resolveSettings(store,"one","main.js").selectionOpacity,50);
  assert.equal(resolveSettings(store,"other").selectionOpacity,35);
  assert.equal(Object.hasOwn(store,"files"),false);
});
