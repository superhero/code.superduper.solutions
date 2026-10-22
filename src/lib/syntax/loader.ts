// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import * as html from '@codemirror/lang-html';
import * as language from '@codemirror/language';
import * as highlight from '@lezer/highlight';
import * as lr from '@lezer/lr';
import * as common from '@lezer/common';
import { decodePayload } from '../formatting/packages.ts';
import { syntaxRegistry } from './registry.ts';
const cache = new Map<string, Promise<language.LanguageSupport>>();
export async function loadInstalledSyntax(id: string): Promise<language.LanguageSupport> {
  const item=syntaxRegistry.catalog.find(item=>item.id===id);
  if(!item)throw new Error('Unknown syntax package.');
  // Always recheck storage, including after removal in another tab. Do not retain
  // package bytes in memory. Only the verified parser instance is cached.
  const {envelope}=await syntaxRegistry.readPackage(item);
  let pending=cache.get(item.sha256);
  if(!pending){
    pending=(async()=>{
      let url='';
      try {
        const module=await import(/* @vite-ignore */ (url=URL.createObjectURL(new Blob([decodePayload(envelope)],{type:'text/javascript'}))));
        const support=module.create({language,highlight,lr,common,html});
        if(!(support instanceof language.LanguageSupport))throw new Error('The syntax package returned invalid language support.');
        return support;
      } finally {URL.revokeObjectURL(url);}
    })();
    cache.set(item.sha256,pending);
    void pending.catch(()=>cache.delete(item.sha256));
  }
  return pending;
}
