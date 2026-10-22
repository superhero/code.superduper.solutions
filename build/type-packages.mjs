// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

let generated;
export function createTypePackages(){return generated??=generate().catch(error=>{generated=undefined;throw error;});}
async function generate(){
  const assets=new Map(),catalog=[];
  const projectNotices=await Promise.all(['LICENSE','LICENSE-ADDITIONAL-TERMS'].map(async name=>({name,version:'application',text:await readFile(name,'utf8')})));
  const typescript=JSON.parse(await readFile('node_modules/typescript/package.json','utf8'));
  const standardNotices=await Promise.all([['LICENSE.txt','typescript'],['ThirdPartyNoticeText.txt','TypeScript third-party notices']].map(async([file,name])=>({name,version:typescript.version,text:await readFile(`node_modules/typescript/${file}`,'utf8')})));
  for(const [id,name,pattern] of [
    ['browser','Browser / DOM',/^lib\.dom(?:\..+)?\.d\.ts$/],
    ['webworker','Web Workers',/^lib\.webworker(?:\..+)?\.d\.ts$/],
    ['scripthost','ScriptHost',/^lib\.scripthost\.d\.ts$/],
    ['node','Node.js',null],
  ]){
    const files={},notices=[...projectNotices];let version=typescript.version;
    if(pattern){
      for(const file of (await readdir('node_modules/typescript/lib')).filter(file=>pattern.test(file)).sort())
        files[`/lib/${file}`]=await readFile(`node_modules/typescript/lib/${file}`,'utf8');
      notices.push(...standardNotices);
    }else{
      for(const npm of ['@types/node','undici-types']){
        const root=`node_modules/${npm}`,metadata=JSON.parse(await readFile(`${root}/package.json`,'utf8'));
        if(npm==='@types/node')version=metadata.version;
        for(const file of (await readdir(root,{recursive:true})).filter(file=>/\.d\.ts$|^package\.json$/.test(file)).sort())
          files[`/repository/node_modules/${npm}/${file}`]=await readFile(`${root}/${file}`,'utf8');
        notices.push({name:npm,version:metadata.version,text:await readFile(`${root}/LICENSE`,'utf8')});
      }
    }
    const payload=Buffer.from(JSON.stringify(files));
    const envelope=Buffer.from(JSON.stringify({schema:1,id,version,kind:'data',payload:payload.toString('base64'),notices}));
    const sha256=createHash('sha256').update(envelope).digest('hex'),filename=`types/${id}-${version}-${sha256.slice(0,12)}.types.json`;
    assets.set(filename,envelope);
    catalog.push({id,name,languages:'JavaScript, TypeScript, JSX, TSX',version,kind:'data',github:id==='node'?'https://github.com/DefinitelyTyped/DefinitelyTyped':'https://github.com/microsoft/TypeScript',bytes:envelope.length,payloadBytes:payload.length,sha256,url:`./${filename}`});
  }
  return{assets,catalog};
}
export function typePackages(){return{
  name:'code-optional-type-libraries',enforce:'pre',
  resolveId(id){if(id==='virtual:type-library-catalog')return '\0type-library-catalog';},
  async load(id){if(id==='\0type-library-catalog')return `export default ${JSON.stringify((await createTypePackages()).catalog)}`;},
  async configureServer(server){
    const {assets}=await createTypePackages();
    server.middlewares.use((request,response,next)=>{
      const bytes=assets.get((request.url??'').split('?')[0].replace(/^\//,''));
      if(!bytes)return next();response.setHeader('Content-Type','application/json');response.end(bytes);
    });
  },
  generateBundle:{order:'post',async handler(){for(const [fileName,source]of(await createTypePackages()).assets)this.emitFile({type:'asset',fileName,source});}},
};}
