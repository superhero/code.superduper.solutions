// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {search,SearchQuery,getSearchQuery,setSearchQuery,findNext,findPrevious,replaceNext,replaceAll} from '@codemirror/search';
import {runScopeHandlers,type EditorView,type ViewUpdate} from '@codemirror/view';

const storageKey='editor.search.replace-expanded';
let expanded=false;
try{expanded=localStorage.getItem(storageKey)==='true';}catch{/* Storage may be unavailable. */}

export const searchPanel=search({createPanel(view){
  const dom=document.createElement('div');dom.className='cm-search';
  const row=document.createElement('div');row.className='cm-search-row cm-search-find-row';
  const replacement=document.createElement('div');replacement.className='cm-search-row cm-search-replace-row';
  const expansion=document.createElement('div');expansion.className='cm-search-expansion';const clip=document.createElement('div');clip.className='cm-search-expansion-clip';clip.append(replacement);expansion.append(clip);
  const field=(name:string,placeholder:string)=>{const input=document.createElement('input');input.name=name;input.className='cm-textfield';input.placeholder=placeholder;input.setAttribute('aria-label',placeholder);input.addEventListener('input',commit);return input;};
  const button=(parent:HTMLElement,label:string,action:()=>void)=>{const control=document.createElement('button');control.type='button';control.className='cm-button';control.textContent=label;control.addEventListener('click',action);parent.append(control);return control;};
  const findGroup=document.createElement('div');findGroup.className='cm-search-input-group';row.append(findGroup);
  const find=field('search','Find');find.setAttribute('main-field','true');findGroup.append(find);
  const iconButton=(label:string,symbol:string,action:()=>void,parent:HTMLElement=findGroup)=>{const control=button(parent,'',action);control.classList.add('cm-search-icon-button');control.dataset.tooltip=label;control.setAttribute('aria-label',label);const icon=document.createElement('span');icon.className='material-symbols-rounded';icon.textContent=symbol;icon.setAttribute('aria-hidden','true');control.append(icon);};
  iconButton('Find next','keyboard_double_arrow_right',()=>findNext(view));iconButton('Find previous','keyboard_double_arrow_left',()=>findPrevious(view));
  const checks:HTMLInputElement[]=[];
  for(const [label,symbol] of [['Match case','match_case'],['Regular expression','regular_expression'],['Whole word','match_word']]){
    const wrapper=document.createElement('label');wrapper.dataset.tooltip=label!;
    const input=document.createElement('input');input.type='checkbox';input.setAttribute('role','switch');input.setAttribute('aria-label',label!);input.addEventListener('change',commit);checks.push(input);
    const icon=document.createElement('span');icon.className='material-symbols-rounded';icon.textContent=symbol!;icon.setAttribute('aria-hidden','true');
    wrapper.append(input,icon);row.append(wrapper);
  }
  const replaceGroup=document.createElement('div');replaceGroup.className='cm-search-input-group';replacement.append(replaceGroup);
  const replace=field('replace','Replace');replaceGroup.append(replace);
  iconButton('Replace','check',()=>replaceNext(view),replaceGroup);iconButton('Replace all','done_all',()=>replaceAll(view),replaceGroup);
  function setExpanded(value:boolean){expanded=value;expansion.classList.toggle('cm-expanded',value);expansion.inert=!value;view.requestMeasure();toggle.setAttribute('aria-expanded',String(value));chevron.style.transform=value?'rotate(90deg)':'';try{localStorage.setItem(storageKey,String(value));}catch{/* Storage may be unavailable. */}}
  const toggle=button(row,'',()=>setExpanded(toggle.getAttribute('aria-expanded')!=='true'));const chevron=document.createElement('span');chevron.className='material-symbols-rounded';chevron.textContent='chevron_right';chevron.setAttribute('aria-hidden','true');chevron.style.transform=expanded?'rotate(90deg)':'';toggle.append(chevron);toggle.name='toggle-replace';toggle.setAttribute('aria-label','Toggle replace');toggle.dataset.tooltip='Toggle replace';row.prepend(toggle);
  if(view.state.readOnly)toggle.hidden=true;
  dom.append(row,expansion);const initiallyExpanded=!view.state.readOnly&&expanded;expansion.classList.toggle('cm-expanded',initiallyExpanded);expansion.inert=!initiallyExpanded;toggle.setAttribute('aria-expanded',String(initiallyExpanded));expansion.addEventListener('transitionend',()=>view.requestMeasure());
  function commit(){view.dispatch({effects:setSearchQuery.of(new SearchQuery({search:find.value,replace:replace.value,caseSensitive:checks[0]!.checked,regexp:checks[1]!.checked,wholeWord:checks[2]!.checked}))});}
  function sync(){const query=getSearchQuery(view.state);find.value=query.search;replace.value=query.replace;checks[0]!.checked=query.caseSensitive;checks[1]!.checked=query.regexp;checks[2]!.checked=query.wholeWord;}
  sync();
  let hint:HTMLElement|undefined, timer:ReturnType<typeof setTimeout>|undefined;
  let hintTarget:HTMLElement|undefined;
  const positionHint=()=>{
    if(!hint||!hintTarget)return;
    const rect=hintTarget.getBoundingClientRect();
    const left=Math.max(8,Math.min(innerWidth-hint.offsetWidth-8,rect.left+(rect.width-hint.offsetWidth)/2));
    hint.style.left=`${left}px`;hint.style.top=`${Math.max(8,rect.top-hint.offsetHeight-8)}px`;
    const arrow=hint.firstElementChild as HTMLElement|null;
    if(arrow)arrow.style.left=`${Math.max(5,Math.min(hint.offsetWidth-15,rect.left+rect.width/2-left-5))}px`;
  };
  const hintObserver=new ResizeObserver(positionHint);hintObserver.observe(dom);
  const hideHint=()=>{clearTimeout(timer);hintTarget=undefined;if(hint){dom.querySelector(`[aria-describedby="${hint.id}"]`)?.removeAttribute('aria-describedby');hint.remove();hint=undefined;}};
  const showHint=(event:Event)=>{
    const target=(event.target as Element).closest<HTMLElement>('[data-tooltip]');
    if(!target||!dom.contains(target))return;
    if(event instanceof MouseEvent&&event.relatedTarget instanceof Node&&target.contains(event.relatedTarget))return;
    hideHint();timer=setTimeout(()=>{
      if(!target.isConnected)return;
      hint=document.createElement('div');hint.className='app-tooltip';hint.role='tooltip';hint.textContent=target.dataset.tooltip!;
      hint.id='search-hint-'+Math.random().toString(36).slice(2);target.setAttribute('aria-describedby',hint.id);
      hint.style.position='fixed';hint.style.pointerEvents='none';hint.style.zIndex='10000';document.body.append(hint);if(typeof hint.showPopover==='function'){hint.setAttribute('popover','manual');hint.style.margin='0';hint.style.border='none';hint.style.inset='auto';hint.showPopover();}
      const rect=target.getBoundingClientRect();hint.style.left=`${Math.max(8,Math.min(innerWidth-hint.offsetWidth-8,rect.left+(rect.width-hint.offsetWidth)/2))}px`;
      hint.style.top=`${Math.max(8,rect.top-hint.offsetHeight-8)}px`;
      hint.style.overflow='visible';
      const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');
      Object.assign(arrow.style,{position:'absolute',top:'100%',width:'10px',height:'5px',background:'var(--color-badge-background)',clipPath:'polygon(0 0,100% 0,50% 100%)',left:`${Math.max(5,Math.min(hint.offsetWidth-15,rect.left+rect.width/2-hint.getBoundingClientRect().left-5))}px`});
      hint.append(arrow);hintTarget=target;positionHint();
    },event.type==='focusin'?0:300);
  };
  dom.addEventListener('mouseover',showHint);dom.addEventListener('focusin',showHint);
  const leaveHint=(event:MouseEvent|FocusEvent)=>{
    const target=(event.target as Element).closest<HTMLElement>('[data-tooltip]');
    if(target&&event.relatedTarget instanceof Node&&target.contains(event.relatedTarget))return;
    hideHint();
  };
  dom.addEventListener('mouseout',leaveHint);dom.addEventListener('focusout',leaveHint);dom.addEventListener('pointerdown',hideHint);
  dom.addEventListener('keydown',event=>{if(event.key==='Escape')hideHint();if(runScopeHandlers(view,event,'search-panel'))event.preventDefault();else if(event.key==='Enter'&&(event.target===find||event.target===replace)){event.preventDefault();if(event.target===replace)replaceNext(view);else(event.shiftKey?findPrevious:findNext)(view);}});
  return {dom,top:false,destroy(){hintObserver.disconnect();hideHint();},mount(){find.select();},update(update:ViewUpdate){if(update.transactions.some(transaction=>transaction.effects.some(effect=>effect.is(setSearchQuery))))sync();}};
}});

export function expandReplace(view:EditorView){const toggle=view.dom.querySelector<HTMLButtonElement>('button[name="toggle-replace"]');if(toggle?.getAttribute('aria-expanded')==='false')toggle.click();view.dom.querySelector<HTMLInputElement>('input[name="replace"]')?.focus();return true;}
