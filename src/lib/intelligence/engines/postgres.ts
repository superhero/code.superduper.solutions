// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {workspace,byteOffset,textOffset} from './postgres-workspace';
import {doc,result} from './common';
import type {EngineRequest,EngineResult} from '../catalog';
export async function run(request:EngineRequest):Promise<EngineResult>{
 const service=await workspace(),document=doc(request),source=document.getText(),path='/'+request.path;
 const schema=request.files['postgres-schema.json'];
 if(schema)service.setSchema(schema);else service.clearSchema();
 service.insertFile(path,source);
 if(request.method==='diagnostics')return {diagnostics:service.lint(path).map(item=>({from:textOffset(source,item.start),to:textOffset(source,item.end),message:item.message,severity:item.severity==='error'||item.severity==='fatal'?'error':item.severity==='warning'?'warning':'info'}))};
 return result(request,request.method==='completion'?{completions:service.complete(path,byteOffset(source,request.position)).map(({kind,...item})=>item)}
 :{hover:{contents:service.hover(path,byteOffset(source,request.position))??''}});
}
