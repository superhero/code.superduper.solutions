// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { formatGenerationDuration } from './presentation.ts';

Then('a generation taking {float} milliseconds is shown as {string}', (milliseconds, label) => {
  assert.equal(formatGenerationDuration(milliseconds), label);
});
Then('non-finite generation durations are rejected', () => {
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => formatGenerationDuration(value), RangeError);
});
