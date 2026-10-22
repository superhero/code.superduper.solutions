// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { BrowserProfile, BrowserFacts, Compatibility } from '../types.ts';
export function probeBrowser(): Promise<BrowserFacts>;
export function compatibilityFor(facts: BrowserFacts | undefined, profile: BrowserProfile, mode?: string): Compatibility;
