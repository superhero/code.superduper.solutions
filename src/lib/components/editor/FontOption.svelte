<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
  import {editorFontStack,interfaceFontStack,googleFont,isBundledEditorFont} from '$lib/editor/fonts';
  import {previewEditorFont} from '$lib/editor/font-storage';
  let {value,label,kind="editor"}:{value:string;label:string;kind?:"editor"|"interface"}=$props();
  let visible=$state(false);
  function observe(element:HTMLElement){
    let disposed=false,cleanup:(()=>void)|undefined;
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;
      visible=true;observer.disconnect();
      void previewEditorFont(value).then(release=>{if(disposed)release();else cleanup=release;});
    });
    observer.observe(element);
    return{destroy(){disposed=true;observer.disconnect();cleanup?.();}};
  }
</script>
<span use:observe style:font-family={visible?(googleFont(value)&&!isBundledEditorFont(value)?`${JSON.stringify(`Code preview ${googleFont(value)!.family}`)}, monospace`:(kind==="editor"?editorFontStack(value):interfaceFontStack(value))):undefined}>{label}</span>
