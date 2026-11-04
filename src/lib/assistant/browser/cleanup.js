// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export function cleanupFailure(error, original) {
  if(error?.cleanupFailed)return error;
  return Object.assign(new Error('Model cleanup could not be confirmed. Reload this page before loading another model. '+(error?.message || String(error)), {cause:error}),
    {name:'ModelCleanupError',cleanupFailed:true,...(original ? {originalError:original} : {})});
}
export function hasCleanupFailure(error) {
  const seen=new Set();
  while(error && typeof error==='object' && !seen.has(error)) {
    if(error.cleanupFailed)return true;
    seen.add(error);error=error.cause;
  }
  return false;
}
/** Retain resources and ownership when native cleanup has an uncertain outcome. */
export class ModelCleanupBoundary {
  constructor(){this.pending=Promise.resolve();this.disposals=new WeakMap();this.held=[];this.failure=null;}
  assertUsable(){if(this.failure)throw this.failure;}
  async ready(){await this.pending;this.assertUsable();}
  quarantine(error,resource){this.failure ||= hasCleanupFailure(error) ? error : cleanupFailure(error);if(resource)this.held.push(resource);return this.failure;}
  release(resource){
    const key=resource.engine || resource.release || resource;
    if(this.disposals.has(key))return this.disposals.get(key);
    const previous=this.pending;
    const disposal=(async()=>{
      try{
        await previous;this.assertUsable();
        await resource.engine?.dispose();
        for(const url of resource.urls || [])(resource.revoke || URL.revokeObjectURL)(url);
        await resource.release?.();
      }catch(error){throw this.quarantine(error,resource);}
    })();
    this.disposals.set(key,disposal);this.pending=disposal;
    void disposal.catch(()=>{});return disposal;
  }
}
