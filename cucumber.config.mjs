// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { mkdirSync } from "node:fs";

mkdirSync("tmp/test", { recursive: true });

const profile = (name, paths, imports) => ({
  format: ["pretty", `json:tmp/test/cucumber-${name}.json`],
  paths,
  import: imports,
});

export const source = profile("source",
  ["src/lib/packages/download.feature", "src/lib/assistant/browser/browser-models.feature", "src/lib/assistant/harness.feature", "src/lib/assistant/presentation.feature", "src/lib/assistant/markdown.feature", "src/lib/intelligence/npm-types.feature", "src/lib/secrets/vault.feature", "src/lib/assistant/openai.feature", "src/lib/assistant/ollama.feature", "src/lib/resources/resources.feature", "src/lib/intelligence/preferences.feature", "src/application.feature", "src/logging.feature", "src/diagnostics.feature", "src/lib/editor/settings.feature", "src/lib/editor/color-mappings.feature", "src/lib/editor/languages.feature", "src/lib/editor/javascript-scopes.feature", "src/lib/editor/function-parameters.feature", "src/lib/editor/javascript-operators.feature", "src/lib/editor/edit-grouping.feature", "src/lib/repository/edit-message.feature",
    "src/lib/editor/editorconfig.feature", "src/lib/editor/formatting.feature", "src/lib/formatting/configuration.feature", "src/lib/formatting/preferences.feature", "src/lib/editor/file-tree.feature", "src/lib/editor/file-icons.feature", "src/lib/editor/git-graph.feature", "src/lib/editor/commit-markdown.feature", "src/lib/editor/drop-files.feature", "src/lib/editor/workspace.feature", "src/lib/repository/paths.feature", "src/lib/repository/line-changes.feature", "src/lib/repository/import.feature", "src/lib/repository/core.feature", "src/lib/repository/remote-git.feature", "src/lib/remotes/remotes.feature", "src/lib/repository/application-history.feature"],
  ["src/lib/packages/download.test.mjs", "src/lib/assistant/browser/browser-models.test.mjs", "src/lib/assistant/harness.test.mjs", "src/lib/assistant/presentation.test.mjs", "src/lib/assistant/markdown.test.mjs", "src/lib/intelligence/npm-types.test.mjs", "src/lib/secrets/vault.test.mjs", "src/lib/assistant/openai.test.mjs", "src/lib/assistant/ollama.test.mjs", "src/lib/resources/resources.test.mjs", "src/lib/intelligence/preferences.test.mjs", "src/application.test.mjs", "src/logging.test.mjs", "src/diagnostics.test.mjs", "src/lib/editor/settings.test.mjs", "src/lib/editor/color-mappings.test.mjs", "src/lib/editor/languages.test.mjs", "src/lib/editor/javascript-scopes.test.mjs", "src/lib/editor/function-parameters.test.mjs", "src/lib/editor/javascript-operators.test.mjs", "src/lib/editor/edit-grouping.test.mjs", "src/lib/repository/edit-message.test.mjs",
    "src/lib/editor/editorconfig.test.mjs", "src/lib/editor/formatting.test.mjs", "src/lib/formatting/configuration.test.mjs", "src/lib/formatting/preferences.test.mjs", "src/lib/editor/file-tree.test.mjs", "src/lib/editor/file-icons.test.mjs", "src/lib/editor/git-graph.test.mjs", "src/lib/editor/commit-markdown.test.mjs", "src/lib/editor/drop-files.test.mjs", "src/lib/editor/workspace.test.mjs", "src/lib/repository/paths.test.mjs", "src/lib/repository/line-changes.test.mjs", "src/lib/repository/import.test.mjs", "src/lib/repository/core.test.mjs", "src/lib/repository/local-git.test.mjs", "src/lib/repository/remote-git.test.mjs", "src/lib/remotes/remotes.test.mjs", "src/lib/repository/application-history.test.mjs"]);

export const acceptance = profile("test", ["src/build.feature", "src/favicons.feature"], ["src/build.test.mjs", "src/favicons.test.mjs"]);
export const automation = profile("automation", [".github/tests/*.feature"], [".github/tests/*.test.mjs"]);
export const browser = {
  ...profile("browser", ["tests/browser/*.feature"], ["tests/browser/support.mjs", "tests/browser/*.steps.mjs"]),
  parallel: 2,
};

export const ollamaLive = { ...profile("ollama-live", ["tests/browser/live/ollama.feature"], ["tests/browser/support.mjs", "tests/browser/*.steps.mjs"]), parallel: 0 };
export const modelsLive = { ...profile('models-live', ['tests/browser/live/browser-models.feature'], ['tests/browser/live/browser-models.steps.mjs']), parallel: 0, failFast: true, tags: process.env.MODEL_LIVE_SPEECH_FIXTURE ? '' : 'not @browser-speech-live' };
export const npmTypesLive = { ...profile("npm-types-live", ["tests/browser/live/npm-types.feature"], ["tests/browser/support.mjs", "tests/browser/*.steps.mjs"]), parallel: 0 };

export const harnessLive = profile("ai-harness-live", ["src/lib/assistant/harness.live.feature"], ["src/lib/assistant/harness.live.test.mjs"]);

export const pagesLive = profile('pages-live', ['tests/browser/live/pages.feature'], ['tests/browser/live/pages.steps.mjs']);

export const pagesBehavior = {
  ...profile('pages-behavior', ['tests/browser/editor.feature', 'tests/browser/import.feature',
    'tests/browser/local-git.feature', 'tests/browser/ai-vault.feature', 'tests/browser/formatting.feature'],
  ['tests/browser/support.mjs', 'tests/browser/*.steps.mjs']),
  parallel: 0,
  tags: 'not @development',
};

export default source;
