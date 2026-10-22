// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {buildNpmTypeArtifact,NPM_TYPE_LIMITS,validateDeclarationPaths} from './npm-types';
import {decodePayload,validatePackage,type FormatterPackage} from '../formatting/packages';
import {npmTypeName} from './type-libraries';
import locateCharacterNotice from '../../../build/licenses/locate-character-3.0.0.txt?raw';

// Reuse the reviewed build notice only for its exact, integrity-verified release.
const noticeFallbacks=[{name:'locate-character',version:'3.0.0',license:'MIT',
  integrity:'sha512-SW13ws7BjaeJ6p7Q6CO2nchbYEc3X3J6WrmTTDto7yMPqVSZTUyY5Tjbid+Ab8gLnATtygYtiDIJGQRRn2ZOiA==',text:locateCharacterNotice}];

self.onmessage=async(event:MessageEvent<{name?:string;import?:ArrayBuffer}>)=>{
  try{
    let result;
    if(event.data.import){
      if(event.data.import.byteLength>NPM_TYPE_LIMITS.total*2)throw new Error('This type package file is too large.');
      const frame=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(event.data.import)) as {item:FormatterPackage;envelope:unknown};
      const name=npmTypeName(frame.item?.id??'');
      if(!name||frame.item.name!==name||frame.item.kind!=='data')throw new Error('This is not an npm type package.');
      const bytes=new TextEncoder().encode(JSON.stringify(frame.envelope));
      const envelope=await validatePackage(bytes.buffer,frame.item);
      validateDeclarationPaths(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decodePayload(envelope))),name);
      result={item:{...frame.item,url:`https://www.npmjs.com/package/${name}`,github:''},bytes:bytes.buffer};
    }else result=await buildNpmTypeArtifact(event.data.name??'',new AbortController().signal,message=>self.postMessage({progress:message}),fetch,noticeFallbacks);
    self.postMessage({result},{transfer:[result.bytes]});
  }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
