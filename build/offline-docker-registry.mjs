// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
/** Replace just the reviewed registry client; do not shim Node networking. */
export function offlineDockerRegistry(){return{
  name:'code-offline-docker-registry',
  async buildStart(){
    const root='node_modules/dockerfile-language-service';
    const metadata=JSON.parse(await readFile(`${root}/package.json`,'utf8'));
    const source=await readFile(`${root}/lib/dockerRegistryClient.js`);
    if(metadata.version!=='0.16.1'||createHash('sha256').update(source).digest('hex')!=='393c3dcc27c934ca7e4bb9d1d644937aec92d994d178766b0e996980ad8c100e')throw new Error('Dockerfile registry client changed; review the offline adapter.');
  },
  transform(code,id){
    if(!id.replaceAll('\\','/').endsWith('/node_modules/dockerfile-ast/lib/util.js'))return;
    if(createHash('sha256').update(code).digest('hex')!=='729a6f38dbb2794b3f38fd68456495c2c0f561a42ee3e76fbfec62bccc1b8fa9')throw new Error('Dockerfile UTF-8 helper changed; review the browser adaptation.');
    return code.replace('Uint8Array.from(Buffer.from(char, "UTF-8"))','new TextEncoder().encode(char)');
  },
  resolveId(source,importer){
    if(importer?.replaceAll('\\','/').includes('/node_modules/dockerfile-language-service/')&&/^(?:\.\/)?dockerRegistryClient(?:\.js)?$/.test(source))return resolve('src/lib/intelligence/docker-registry.ts');
  }
};}
