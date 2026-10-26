// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type {AgentTool} from '@earendil-works/pi-agent-core';
import type {BrowserProfile} from '../../types.ts';
export function createVisionTool(options: {
  profile: BrowserProfile; getImage(id: string): unknown;
  onState(state: {busy: boolean; status?: string}): void;
  suspendText(): Promise<void>;
  resumeText(options: {signal: AbortSignal}): Promise<boolean>;
  loadVision(profile: BrowserProfile, options: {signal: AbortSignal}): Promise<{generate: (...args: any[]) => Promise<unknown>; dispose(): Promise<void>}>;
}): {tool: AgentTool; dispose(): Promise<void>};
