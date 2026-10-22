// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile} from 'node:fs/promises';
import {rolldown} from 'rolldown';
import {collectInlineWorkerLicenses} from './license-notices.mjs';
import {browserLanguageResources,resourcesFor} from './language-resources.mjs';
import {offlineDockerRegistry} from './offline-docker-registry.mjs';
export const dockerfileFormatterPackage=()=>browserFormatterPackage('dockerfile-service','dockerfile-language-service');
export async function browserFormatterPackage(id,npm){
  const metadata=JSON.parse(await readFile(`node_modules/${npm}/package.json`,'utf8')),notices=[];
  const bundle=await rolldown({input:`src/lib/formatting/${id}.ts`,platform:'browser',logLevel:'warn',plugins:[browserLanguageResources(),offlineDockerRegistry(),collectInlineWorkerLicenses(notices)]});
  try{
    const result=await bundle.generate({format:'es',minify:true,codeSplitting:false});
    const chunks=result.output.filter(item=>item.type==='chunk');
    if(chunks.length!==1||chunks[0].imports.length||chunks[0].dynamicImports.length)throw new Error('Dockerfile formatter has external runtime imports.');
    return{version:metadata.version,payload:Buffer.from(chunks[0].code),notices,resources:await resourcesFor(id)};
  }finally{await bundle.close();}
}
