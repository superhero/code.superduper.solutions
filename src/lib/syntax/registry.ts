// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import catalog from 'virtual:syntax-catalog';
import { createPackageRegistry } from '../packages/registry.ts';
export const syntaxRegistry = createPackageRegistry(catalog, 'code-syntax-packages');
