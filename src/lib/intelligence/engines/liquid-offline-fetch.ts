// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/** Theme Check's remote asset-size probe is unavailable in offline analysis. */
export const fetch:typeof globalThis.fetch=async()=>{throw new Error('Remote asset metadata is unavailable in local analysis.');};
export default fetch;
