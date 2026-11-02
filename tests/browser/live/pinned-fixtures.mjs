// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
/** Immutable read-only fixtures still pass through the application's real installer. */
export async function pinnedFixtures(context,entries,report){
 const byURL=new Map(),byHash=new Map();
 for(const entry of entries){const info=await stat(entry.path),hash=createHash('sha256');
  if(info.size!==entry.bytes)throw Error('Fixture size differs: '+entry.id);
  for await(const block of createReadStream(entry.path,{highWaterMark:8*1024*1024}))hash.update(block);
  if(hash.digest('hex')!==entry.sha256)throw Error('Fixture checksum differs: '+entry.id);
  byURL.set(new URL(entry.url).origin+new URL(entry.url).pathname,entry);byHash.set(entry.sha256,entry);report('fixture-verified',{id:entry.id,sha256:entry.sha256,bytes:entry.bytes});
 }
 const server=createServer((request,response)=>{
  const entry=byHash.get((request.url??'').slice(1));if(!entry){response.writeHead(404).end();return;}
  const range=request.headers.range?.match(/^bytes=(\d+)-(\d*)$/),start=range?Number(range[1]):0,end=range?.[2]?Number(range[2]):entry.bytes-1;
  if(start<0||end<start||end>=entry.bytes){response.writeHead(416).end();return;}
  response.writeHead(range?206:200,{'content-length':end-start+1,'accept-ranges':'bytes','access-control-allow-origin':'*','access-control-expose-headers':'content-range, content-length, accept-ranges','cross-origin-resource-policy':'cross-origin',...(range?{'content-range':`bytes ${start}-${end}/${entry.bytes}`}:{})});
  if(request.method==='HEAD'){response.end();return;}const stream=createReadStream(entry.path,{start,end});response.on('close',()=>stream.destroy());stream.on('error',error=>response.destroy(error));stream.pipe(response);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const deliver=async route=>{
  const url=new URL(route.request().url()),file=byURL.get(url.origin+url.pathname);if(!file){await route.fallback();return;}
  await route.fulfill({status:307,headers:{location:`http://127.0.0.1:${server.address().port}/${file.sha256}`,'access-control-allow-origin':'*'}});
 };
 for(const origin of new Set(entries.map(entry=>new URL(entry.url).origin)))await context.route(origin+'/**',deliver);
 return{async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
