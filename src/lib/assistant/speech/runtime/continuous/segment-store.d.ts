// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type {SpeechSegment,SpeechAudio} from '../../continuous-types';
export function createSegmentStore(options?:{name?:string;indexedDB?:IDBFactory}):{
 put(record:SpeechAudio):Promise<unknown>;get(id:string):Promise<SpeechAudio|null>;list(recordingId?:string):Promise<SpeechSegment[]>;
 update(id:string,patch:Partial<SpeechSegment>):Promise<SpeechSegment>;removeRecording(recordingId:string):Promise<void>;close():Promise<void>;
};
