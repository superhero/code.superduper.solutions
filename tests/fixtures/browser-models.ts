// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// Test-only imports; never included in the application build.
export * from '../../src/lib/assistant/browser/storage.ts';
export * from '../../src/lib/assistant/browser/catalog.ts';
export * from '../../src/lib/assistant/browser/reference/compatibility.js';
export { prepareImage } from '../../src/lib/assistant/browser/images.ts';
export { wireMessages, localStream } from '../../src/lib/assistant/browser/reference/adapters.js';
export { BrowserAgentHarness } from '../../src/lib/assistant/harness.ts';
