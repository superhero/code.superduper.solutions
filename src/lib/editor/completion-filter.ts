// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {autocompletion,completeFromList,type Completion,type CompletionSource,type CompletionContext,type CompletionResult} from '@codemirror/autocomplete';

/** Allow at most two skipped characters between consecutive matched letters. */
function closeMatch(label:string,pattern:string):boolean {
  if(!pattern)return true;
  const text=label.toLowerCase(),query=pattern.toLowerCase();
  let positions=Array.from({length:text.length},(_,index)=>index).filter(index=>text[index]===query[0]);
  for(let letter=1;letter<query.length&&positions.length;letter++){
    const next=new Set<number>();
    for(const previous of positions)for(let gap=1;gap<=3;gap++){
      const index=previous+gap;if(text[index]===query[letter])next.add(index);
    }
    positions=[...next];
  }
  return positions.length>0;
}

/** Refilter cached options on each keystroke without another worker request. */
export function filterCompletionGaps(result:CompletionResult|null,context:CompletionContext):CompletionResult|null {
  if(!result||result.filter===false)return result;
  const options=result.options,validFor=result.validFor;
  const filtered=(pattern:string)=>options.filter(option=>closeMatch(option.label,pattern));
  return {...result,options:filtered(context.state.sliceDoc(result.from,result.to??context.pos)),validFor:()=>false,
    update(current,from,to,next){
      const pattern=next.state.sliceDoc(from,to);
      const valid=typeof validFor==='function'?validFor(pattern,from,to,next.state)
        :validFor?new RegExp(`^(?:${validFor.source})$`,validFor.flags.replace(/[gy]/g,'')).test(pattern):false;
      if(!valid)return null;
      return {...current,from,to,options:filtered(pattern)};
    }};
}

/** Use the same filtering when language engines are disabled. */
export function nativeFilteredCompletion(){
  return autocompletion({override:[async context=>{
    for(const source of context.state.languageDataAt<CompletionSource|readonly Completion[]>('autocomplete',context.pos)){
      const result=await(typeof source==='function'?source:completeFromList(source))(context);
      if(context.aborted)return null;
      if(result?.options.length)return filterCompletionGaps(result,context);
    }
    return null;
  }]});
}
