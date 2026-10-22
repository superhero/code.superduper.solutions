// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import {DockerfileLanguageServiceFactory} from 'dockerfile-language-service';
import {TextDocument} from 'vscode-languageserver-textdocument';
const service=DockerfileLanguageServiceFactory.createLanguageService();
export async function format(source:string,options:{tabWidth:number;useTabs:boolean}):Promise<string>{
  const document=TextDocument.create('file:///Dockerfile','dockerfile',1,source);
  return TextDocument.applyEdits(document,service.format(source,{tabSize:options.tabWidth,insertSpaces:!options.useTabs}));
}
