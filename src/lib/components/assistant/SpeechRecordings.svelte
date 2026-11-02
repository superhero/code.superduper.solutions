<!-- Copyright (C) 2026 Erik Landvall
SPDX-License-Identifier: AGPL-3.0-only
See LICENSE and LICENSE-ADDITIONAL-TERMS. -->
<script lang="ts">
 import {onMount} from 'svelte';
 import {Button} from '$lib/components/ui/button';
 import MaterialIcon from '$lib/components/MaterialIcon.svelte';
 import {speech} from '$lib/assistant/speech/controller';
 import {speechRecordings,speechRecordingWave,removeSpeechRecording,recoveryWave} from '$lib/assistant/speech/recordings';
 let rows=$state<{id:string;seconds:number;segments:number}[]>([]),busy=$state(false),failure=$state(''),active=$state(false),unsaved=$state(false);
 async function refresh(){
  try{const groups=new Map<string,{id:string;seconds:number;segments:number}>();
   for(const row of await speechRecordings()){const value=groups.get(row.recordingId)??{id:row.recordingId,seconds:0,segments:0};value.seconds+=(row.endSample-row.coreStartSample)/16000;value.segments++;groups.set(row.recordingId,value);}
   rows=[...groups.values()];unsaved=speech.recoveryAudio().length>0;
  }catch(error){failure=String(error);}
 }
 function save(blob:Blob,name:string){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function act(id:string,remove=false){busy=true;failure='';try{if(remove){await removeSpeechRecording(id);await refresh();}else save(await speechRecordingWave(id),`dictation-${id}.wav`);}catch(error){failure=String(error);}finally{busy=false;}}
 onMount(()=>{let phase='';void refresh();return speech.subscribe(state=>{active=['permission','recording','stopping'].includes(state.phase);if(state.phase!==phase){phase=state.phase;if(!active)void refresh();}});});
</script>
<div class="local-recordings" aria-label="Local speech recordings">
 <div class="recording-heading"><strong>Local recordings</strong><Button variant="ghost" size="icon" aria-label="Refresh local recordings" tooltip="Refresh local recordings" disabled={busy} onclick={()=>void refresh()}><MaterialIcon name="refresh" size={16}/></Button></div>
 <p>Continuous dictation keeps recovery audio in this browser. Export or remove it here.</p>
 {#if unsaved}<div role="alert"><p>Some audio could not be saved. Export it before closing this page.</p><Button variant="secondary" size="sm" onclick={()=>save(recoveryWave(speech.recoveryAudio()),'dictation-unsaved.wav')}><MaterialIcon name="download" size={16}/>Export unsaved audio</Button></div>{/if}
 {#each rows as row(row.id)}<div class="recording-row"><span title={row.id}>Recording {row.id.slice(0,8)}<small>{Math.round(row.seconds)}s · {row.segments} segments</small></span><Button variant="ghost" size="icon" aria-label={`Export recording ${row.id.slice(0,8)}`} tooltip="Export audio" disabled={busy||active} onclick={()=>void act(row.id)}><MaterialIcon name="download" size={17}/></Button><Button variant="ghost" size="icon" aria-label={`Remove recording ${row.id.slice(0,8)}`} tooltip="Remove local audio" disabled={busy||active} onclick={()=>void act(row.id,true)}><MaterialIcon name="delete" size={17}/></Button></div>{/each}
 {#if !rows.length}<p class="subtle">No saved recordings.</p>{/if}
 {#if failure}<p role="alert">{failure}</p>{/if}
</div>
<style>
 .local-recordings{display:grid;gap:8px;font-size:.6875rem}.recording-heading,.recording-row{display:flex;align-items:center;gap:8px}.recording-heading strong,.recording-row>span{flex:1;min-width:0}.recording-row{background:var(--color-background);padding:4px 8px;border-radius:4px}p{margin:0;line-height:1.5}small{display:block;opacity:.65;font-size:.625rem}.subtle{opacity:.65}
</style>
