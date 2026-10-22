// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import catalog from 'virtual:type-library-catalog';
import {createPackageRegistry} from '../packages/registry';
import {decodePayload} from '../formatting/packages';
import type {TypeLibraryChoices} from './type-libraries';
import {npmTypeRegistry} from './npm-type-registry';
export const typeRegistry=createPackageRegistry(catalog,'code-type-packages','Settings → Type libraries');

/** Read enabled, verified declarations once at worker startup; never execute them. */
export async function loadTypeLibraries(choices:TypeLibraryChoices):Promise<{files:Record<string,string>;payloads:string[]}>{
  const selected=catalog.filter(item=>choices[item.id as keyof TypeLibraryChoices]);
  const installed=selected.length?await typeRegistry.installedPackages():[],libraries:Record<string,string>={},payloads:string[]=[];
  for(const item of selected){
    if(!installed.some(record=>record.id===item.id&&record.sha256===item.sha256))continue;
    const {envelope}=await typeRegistry.readPackage(item);
    const files:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decodePayload(envelope)));
    if(!files||typeof files!=='object'||Array.isArray(files)||Object.values(files).some(value=>typeof value!=='string'))throw new Error('The type library declarations are invalid.');
    Object.assign(libraries,files);
  }
  if(Object.keys(choices).some(id=>id.startsWith('npm:')&&choices[id]))for(const item of await npmTypeRegistry.installedPackages())if(choices[item.id])payloads.push((await npmTypeRegistry.readPackage(item)).envelope.payload);
  return {files:libraries,payloads};
}
