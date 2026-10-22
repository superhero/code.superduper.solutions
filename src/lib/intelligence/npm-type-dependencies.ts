// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {parser} from '@lezer/javascript';
import {isNpmPackageName} from './type-libraries.ts';

/** Read declaration string tokens, excluding prose/comments and relative paths. */
export function referencedTypePackages(sources:readonly string[]):Set<string>{
  const dependencies=new Set<string>(),typescript=parser.configure({dialect:'ts'});
  for(const source of sources){
    typescript.parse(source).iterate({enter(node){
      if(node.name!=='String')return;
      const literal=source.slice(node.from,node.to);let specifier=literal.slice(1,-1);
      if(specifier.includes('\\'))try{specifier=JSON.parse(literal[0]==='"'?literal:`"${specifier.replace(/\\'/g,"'").replace(/"/g,'\\"')}"`);}catch{return;}
      const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0]!;
      if(isNpmPackageName(name))dependencies.add(name);
    }});
    for(const match of source.matchAll(/^\s*\/\/\/\s*<reference\s+types=["']([^"']+)["']/gm))if(isNpmPackageName(match[1]!))dependencies.add(match[1]!);
  }
  return dependencies;
}
