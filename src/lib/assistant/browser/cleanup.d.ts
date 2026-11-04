// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export interface OwnedModelResource {engine?:{dispose():Promise<void>}|undefined;urls?:string[];release?:(()=>Promise<void>)|undefined;revoke?:(url:string)=>void}
export function cleanupFailure(error:unknown,original?:unknown):Error;
export function hasCleanupFailure(error:unknown):boolean;
export class ModelCleanupBoundary {
  assertUsable():void;
  ready():Promise<void>;
  quarantine(error:unknown,resource?:OwnedModelResource):Error;
  release(resource:OwnedModelResource):Promise<void>;
}
