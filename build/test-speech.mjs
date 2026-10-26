// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
await mkdir('tmp/test', { recursive: true });
const scope = process.env.SPEECH_LIVE === '1' ? 'speech-live' : 'speech';
await rm(`tmp/test/${scope}-vitest.json`, { force: true });
await rm(`tmp/test/cucumber-${scope}.json`, { force: true });
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.speech.config.mjs', ...process.argv.slice(2)], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))); });
try {
  const report = JSON.parse(await readFile(`tmp/test/${scope}-vitest.json`, 'utf8'));
  // Preserve every independently named QuickPickle scenario in the combined report.
  // The synthetic result step describes the runner outcome, not invented Gherkin steps.
  const features = report.testResults.map(file => ({ uri: file.name, keyword: 'Feature',
    name: file.assertionResults[0]?.ancestorTitles[0]?.replace(/^Feature: /, '') ?? 'Speech input',
    id: file.name, elements: file.assertionResults.map((test, index) => ({
      id: test.fullName, keyword: 'Scenario', type: 'scenario', line: index + 1,
      name: test.title.replace(/^Scenario: /, ''), steps: [{ keyword: 'Then ', name: 'the Vitest / QuickPickle scenario passes',
        result: { status: test.status === 'passed' ? 'passed' : ['pending', 'todo', 'skipped'].includes(test.status) ? 'skipped' : 'failed',
          duration: Math.round((test.duration ?? 0) * 1e6), ...(test.failureMessages?.length ? { error_message: test.failureMessages.join('\n') } : {}) },
      }],
    })),
  }));
  await writeFile(`tmp/test/cucumber-${scope}.json`, JSON.stringify(features, null, 2) + '\n');
} catch (error) { console.error('Speech scenario report could not be produced:', error.message); process.exitCode = 1; }
process.exitCode ||= code;
