// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import { defineConfig } from 'vitest/config';
import { quickpickle } from 'quickpickle';
import { speechRuntime } from './build/speech-runtime.mjs';
const live = process.env.SPEECH_LIVE === '1';
export default defineConfig({ plugins: [quickpickle({stepTimeout:live?180_000:3000}), speechRuntime()],
  test: { include: live?['tests/speech/live/*.feature']:['tests/speech/*.feature','tests/models/*.feature'], setupFiles: live?['tests/speech/live/steps.mjs']:['tests/speech/steps.ts','tests/models/steps.mjs'],
    testTimeout: live?600_000:15_000, hookTimeout:live?180_000:15_000, fileParallelism: false, reporters: ['default', 'json'],
    outputFile: { json: `tmp/test/${live?'speech-live':'speech'}-vitest.json` },
  },
});
