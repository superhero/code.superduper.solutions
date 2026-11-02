// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export interface SpeechSegment {
 sessionId:string;recordingId:string;index:number;audioStartSample:number;coreStartSample:number;endSample:number;
 status:string;reason?:string;transcript?:{text:string;words:unknown[]};
}
export interface SpeechAudio extends SpeechSegment {pcm:Float32Array}
export interface ContinuousState {
 ready:boolean;loading:boolean;recording:boolean;finishing:boolean;recordingId:string|null;lastError:string|null;
 session:{capturedSamples:number;queuedSegments:number;completedSegments:number;featureOwners:number}|null;
}
export interface ContinuousTranscript {
 recordingId:string;stableDelta:{sequence:number;text:string;words:unknown[]};draftText:string;final:boolean;
}
export interface LongSpeech {
 load():Promise<{runtime:Record<string,unknown>}>;
 startRecord(options?:{recordingId?:string}):Promise<unknown>;stopRecord():Promise<unknown>;
 startInjected(options?:{recordingId?:string}):Promise<unknown>;pushPcm(pcm:Float32Array):Promise<unknown>;finishInjected():Promise<unknown>;
 cancel():Promise<unknown>;unload():Promise<unknown>;snapshot():ContinuousState;
 listSegments():Promise<SpeechSegment[]>;getSegment(id:string):Promise<SpeechAudio|null>;getRecoveryAudio():SpeechAudio[];
 getTranscript():string;stats():Promise<unknown>;
}
