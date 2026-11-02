// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/** Shared ORT/Asyncify state must finish one model operation before another starts. */
export function createComputeQueue({fatal=false,onFatal=()=>{}}={}){
 let tail=Promise.resolve(),failure;
 return work=>{
  const current=tail.then(async()=>{
   if(failure)throw Error('Speech runtime is invalid; load a fresh worker before retrying.',{cause:failure});
   try{return await work();}catch(error){if(fatal){failure=error;onFatal(error);}throw error;}
  });
  tail=current.catch(()=>{});return current;
 };
}
