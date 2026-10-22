// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
declare module "diff3" {
  type Block = { ok?: string[]; conflict?: { a: string[]; b: string[]; o: string[] } };
  export default function merge(ours: string[], base: string[], theirs: string[]): Block[];
}
