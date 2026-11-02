// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let prepared;
/** Reproduce the four pinned NR generation steps without touching the reference tree. */
export function prepareNqSpeech(){return prepared??=generate().catch(error=>{prepared=undefined;throw error;});}
async function generate(){
 const directory=resolve(process.env.CODE_SPEECH_BUILD_DIRECTORY??'tmp/build/speech-nq');await mkdir(directory,{recursive:true});
 const provenance=JSON.parse(await readFile('src/lib/assistant/speech/continuous-sources.json'));
 for(const name of ['resident-decoder.js','selection-decoder.js','grouped-decoder.js'])await copyFile('src/lib/assistant/speech/runtime/nq/'+name,resolve(directory,name));
 for(const name of ['prepare-resident.mjs','prepare-selection.mjs','prepare-grouped.mjs','prepare-live.mjs']){
  const file='build/speech/nq/'+name,bytes=await readFile(file);
  if(hash(bytes)!==provenance[file].source_sha256)throw Error('NR generation recipe changed: '+name);
  let source=bytes.toString().replace("new URL('./node_modules/parakeet.js/src/parakeet.js',import.meta.url)",`new URL(${JSON.stringify(pathToFileURL(resolve('node_modules/parakeet.js/src/parakeet.js')).href)})`);
  source=source.replace(/new URL\('\.\.\/\.\.\/\.\.\/attempts\/([^']+)\/',import.meta.url\)/g,(_match,id)=>`new URL('./proofs/${id}/',import.meta.url)`);
  const script=resolve(directory,name);await writeFile(script,source);await import(pathToFileURL(script).href+'?source='+hash(bytes));
 }
 return {'parakeet-tokenizer':resolve('node_modules/parakeet.js/src/tokenizer.js'),
  'resident-parakeet-model':resolve(directory,'.runtime/resident-parakeet.js'),
  'selection-parakeet-model':resolve(directory,'.runtime/selection-parakeet.js'),
  'grouped-parakeet-model':resolve(directory,'.runtime/grouped-parakeet.js'),
  'variable-grouped-decoder':resolve(directory,'.runtime/variable-grouped-decoder.js')};
}
