// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {DockerfileLanguageServiceFactory} from 'dockerfile-language-service';
import {doc,result} from './common';
import type {EngineRequest} from '../catalog';
const service=DockerfileLanguageServiceFactory.createLanguageService();
service.setCapabilities({completion:{completionItem:{snippetSupport:true,documentationFormat:['plaintext']}},hover:{contentFormat:['plaintext']}});
export async function run(request:EngineRequest){
  const document=doc(request),source=document.getText(),position=document.positionAt(request.position);
  return result(request,request.method==='completion'?{completions:await service.computeCompletionItems(source,position)}
    :request.method==='hover'?{hover:service.computeHover(source,position)}:{diagnostics:service.validate(source)});
}
