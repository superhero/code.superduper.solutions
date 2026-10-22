// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
// LightningFS's text encoder dependency recognizes window/global, but not self.
if (!("global" in globalThis)) Object.defineProperty(globalThis, "global", { value: globalThis, configurable: true });
