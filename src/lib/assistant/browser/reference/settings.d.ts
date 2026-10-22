// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { BrowserProfile } from '../types.ts';
export function defaultSettings(profile: BrowserProfile, overrides?: Record<string, unknown>): Record<string, number | boolean | string>;
export function validateSettings(profile: BrowserProfile, settings: Record<string, unknown>): Record<string, number | boolean | string>;
export function configuredProfile(profile: BrowserProfile, settings: Record<string, unknown>): BrowserProfile;
export function isWebML(engine: string): boolean;
export function isWllama(engine: string): boolean;
