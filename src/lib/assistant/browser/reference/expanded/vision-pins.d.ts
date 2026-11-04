// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type {BrowserProfile} from '../../types';
export const COMPATIBLE_VISION: 'official-q4-fp32-compatible-v1';
export function isCompatibleVision(profile: Pick<BrowserProfile,'settings'>): boolean;
export function visionPin(profile: BrowserProfile): Record<string,unknown>;
export function requireVisionDevice(info: unknown): void;
export function requireVisionDispatch(result: unknown): void;
