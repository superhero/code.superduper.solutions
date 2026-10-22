// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import catalog from 'virtual:language-engine-catalog';
import { createPackageRegistry } from '../packages/registry.ts';
const registry = createPackageRegistry(catalog, 'code-language-packages');
export const { catalog: languagePackages, installedPackages, readPackage, subscribe: subscribeLanguagePackages,
  importPackage: importLanguagePackage, installPackage: installLanguageEngine, removePackage: removeLanguageEngine } = registry;
