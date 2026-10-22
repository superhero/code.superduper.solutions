// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {Workspace} from '@postgres-language-server/wasm/workspace';
import createPGLS from 'virtual:pgls-module';
import {bytes} from 'virtual:engine-resources';
let pending:Promise<Workspace>|undefined;
export function workspace(){return pending??=createPGLS({wasmBinary:bytes('postgres'),locateFile:()=> 'code-installed:postgres.wasm'}).then(module=>{
  if(module._pgls_init()!==0)throw new Error('PostgreSQL engine initialization failed.');
  return new Workspace(module);
});}
/** PostgreSQL reports UTF-8 byte offsets; CodeMirror uses UTF-16 positions. */
export const byteOffset=(text:string,offset:number)=>new TextEncoder().encode(text.slice(0,offset)).length;
export const textOffset=(text:string,offset:number)=>new TextDecoder().decode(new TextEncoder().encode(text).slice(0,offset)).length;
