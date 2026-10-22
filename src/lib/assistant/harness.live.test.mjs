// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { BrowserAgentHarness, ollamaPlugin } from './harness.ts';
import { repositoryTools } from './tools.ts';
Then('local Ornith uses Pi to read a file and reports its exact fixture value', { timeout: 290000 }, async function () {
  const value = `pi-proof-${Math.random().toString(36).slice(2, 10)}`;
  const repository = { id: 'local-tool-fixture', revision: '1', files: new Set(['README.md']), read: async path => { assert.equal(path, 'README.md'); return `Verification value: ${value}`; } };
  const activities = [], usage = []; let output = '';
  const started = performance.now();
  const result = await new BrowserAgentHarness().run(ollamaPlugin('http://localhost:11434', item => usage.push(item)), 'ornith:9b-q8_0',
    [{ role: 'user', content: 'Use read_file to read README.md. Reply with the exact verification value in that file. Do not guess it.' }], AbortSignal.timeout(270000), text => output += text,
    { instructions: 'You are a code assistant. Read repository files using the provided tools when asked. Never invent file contents. Reply briefly.', contextWindow: 8192,
      tools: repositoryTools(repository), onTool: item => activities.push(item), onUsage: item => usage.push(item) });
  await mkdir('tmp/test', { recursive: true });
  await writeFile('tmp/test/ai-harness-live.json', JSON.stringify({ model: 'ornith:9b-q8_0', elapsedMs: Math.round(performance.now() - started), output, activities, usage, result }, null, 2));
  assert.equal(result.reason, 'stop'); assert.ok(activities.some(item => item.name === 'read_file' && item.status === 'completed'));
  assert.ok(output.includes(value), 'Ornith must quote the value returned by the actual tool.');
});
