// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type {ContinuousState,ContinuousTranscript,LongSpeech} from '../../continuous-types';
export function createLongSpeech(options:{config:Record<string,unknown>;onState?(state:ContinuousState):void;onTranscript?(transcript:ContinuousTranscript):void;onEvent?(event:{type:string;text?:string;runtime?:Record<string,unknown>}):void;createWorker?(url:string):Worker}):LongSpeech;
