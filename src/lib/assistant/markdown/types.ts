// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { Env } from 'markdown-it';

export interface MarkdownEnvironment extends Env {
  docId: string;
  blocks: string[];
  hideGeneratedFooter: boolean;
  tabSequence: number;
  containerTags: string[];
  chatTabs: { id: string; active: number }[];
  mathjax?: (source: string) => string;
  source: string;
  sourceLines?: string[];
  streaming: boolean;
  usedIds: Set<string>;
}
