// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { VaultSession } from "./session";
import type { VaultErrorCode } from "./types";
export type VaultMethod = "status" | "unlock" | "prepareCreate" | "confirmCreate" | "keys" | "list" | "copyCredential" | "put" | "remove"
  | "backup" | "restore" | "addMethod" | "removeMethod" | "rotate";
export type VaultArguments<M extends VaultMethod> = Parameters<VaultSession[M]>;
export type VaultResult<M extends VaultMethod> = Awaited<ReturnType<VaultSession[M]>>;
export type VaultReply = { id: number; ok: true; value: unknown } | { id: number; ok: false; code: VaultErrorCode }
  | { id: number; delta: string } | { event: "locked" };
