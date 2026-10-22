// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {rolldown} from 'rolldown';
import {formatterArtifact} from './formatter-artifacts.mjs';
import {collectInlineWorkerLicenses} from './license-notices.mjs';
export async function fourmoluPackage(){
  const artifact=await formatterArtifact('fourmolu');
  const supplement=JSON.parse(await readFile('build/licenses/fourmolu-0.21.0.0.json','utf8'));
  if(supplement.version!==artifact.metadata.version||supplement.wasmSha256!==createHash('sha256').update(artifact.bytes).digest('hex'))throw new Error('Fourmolu changed; review its GHC, Haskell and WASI dependency notices.');
  const notices=[];
  const bundle=await rolldown({input:'src/lib/formatting/fourmolu.ts',platform:'browser',logLevel:'warn',plugins:[collectInlineWorkerLicenses(notices)]});
  try{
    const output=await bundle.generate({format:'es',minify:true,codeSplitting:false});
    const chunks=output.output.filter(file=>file.type==='chunk');
    if(chunks.length!==1||chunks[0].imports.length||chunks[0].dynamicImports.length)throw new Error('Fourmolu has external runtime imports.');
    return{version:artifact.metadata.version,payload:Buffer.from(chunks[0].code),wasm:artifact.bytes.toString('base64'),
      notices:[...notices,...supplement.notices]};
  }finally{await bundle.close();}
}
