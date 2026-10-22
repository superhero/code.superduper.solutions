// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {workspace} from '../intelligence/engines/postgres-workspace';
export {setResources as initialize} from 'virtual:engine-resources';
export async function format(source:string,options:{tabWidth:number;useTabs:boolean}):Promise<string>{
 const service=await workspace(),output=service.formatSql(source,{indentSize:options.tabWidth,indentStyle:options.useTabs?'tabs':'spaces'});
 if(output.diagnostics.length)throw new Error(output.diagnostics.map(item=>item.message).join('\n'));
 return output.formatted;
}
