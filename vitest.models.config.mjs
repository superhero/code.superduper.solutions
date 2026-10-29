// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {defineConfig} from 'vitest/config';
import {quickpickle} from 'quickpickle';
export default defineConfig({plugins:[quickpickle()],test:{include:['tests/models/*.feature'],setupFiles:['tests/models/steps.mjs'],fileParallelism:false}});
