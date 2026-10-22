// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
export function tarFixture(files){
  const chunks=[];
  for(const [path,text]of Object.entries(files)){
    const bytes=Buffer.from(text),header=Buffer.alloc(512);header.write(path,0,100,'utf8');header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
    header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header.fill(32,148,156);header[156]=48;header.write('ustar\0',257);
    const checksum=header.reduce((sum,byte)=>sum+byte,0);header.write(checksum.toString(8).padStart(6,'0')+'\0 ',148);
    chunks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));
  }
  return Buffer.concat([...chunks,Buffer.alloc(1024)]);
}
export function npmFixture(name,files,options={}){
  const version=options.version??'1.0.0',manifest={name,version,types:'index.d.ts',license:'MIT',dependencies:options.dependencies??{},peerDependencies:options.peers??{},...options.manifest};
  const tar=tarFixture({'package/package.json':JSON.stringify(options.archiveManifest??manifest),...(options.license===false?{}:{'package/LICENSE':'MIT License\nCopyright (c) Fixture authors\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software, to use, copy, modify, publish and distribute it.\n'}),'package/runtime.js':'throw new Error("Runtime code must never be executed");',...Object.fromEntries(Object.entries(files).map(([path,text])=>['package/'+path,text]))});
  const archive=gzipSync(tar),tarball=`https://registry.npmjs.org/${name}/-/fixture-${version}.tgz`;
  return {manifest,archive,tar,metadata:{...manifest,dist:{tarball,integrity:'sha512-'+createHash('sha512').update(archive).digest('base64')}}};
}
export function registryFixture(packages,search=[]){
  return async input=>{
    const url=new URL(String(input));
    if(url.pathname==='/-/v1/search')return new Response(JSON.stringify({objects:search.map(item=>({package:item})),total:search.length}));
    for(const fixture of packages){
      if(url.href===fixture.metadata.dist.tarball)return new Response(fixture.archive);
      if(decodeURIComponent(url.pathname)===`/${fixture.metadata.name}/latest`||decodeURIComponent(url.pathname)===`/${fixture.metadata.name}/${fixture.metadata.version}`)return new Response(JSON.stringify(fixture.metadata));
      if(decodeURIComponent(url.pathname)===`/${fixture.metadata.name}`)return new Response(JSON.stringify({'dist-tags':{latest:fixture.metadata.version},versions:Object.fromEntries(packages.filter(item=>item.metadata.name===fixture.metadata.name).map(item=>[item.metadata.version,{name:item.metadata.name,version:item.metadata.version,dependencies:item.metadata.dependencies,dist:item.metadata.dist}]))}));
    }
    return new Response('{}',{status:404});
  };
}
