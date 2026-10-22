// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import MarkdownIt from 'markdown-it';

const markdown=new MarkdownIt({html:false,linkify:false,breaks:false});
// Documentation must never fetch embedded images or execute source HTML.
markdown.renderer.rules.image=(tokens,index)=>markdown.utils.escapeHtml(tokens[index]!.content);
markdown.renderer.rules.link_open=(tokens,index,options,_environment,renderer)=>{
  tokens[index]!.attrSet('target','_blank');
  tokens[index]!.attrSet('rel','noopener noreferrer');
  return renderer.renderToken(tokens,index,options);
};
export function renderHoverMarkdown(text:string):string{return markdown.render(text);}
