// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
declare module 'virtual:language-engine-catalog' {
  const catalog: import('../formatting/packages.ts').FormatterPackage[];
  export default catalog;
}
declare module 'virtual:type-library-catalog' {
  const catalog: import('../formatting/packages.ts').FormatterPackage[];
  export default catalog;
}
declare module 'virtual:typescript-libraries' {
  const libraries: Record<string,string>;
  export default libraries;
}
declare module 'virtual:engine-resources' {
  export function setResources(value:Record<string,string>):void;
  export function bytes(name:string):Uint8Array<ArrayBuffer>;
}
declare module 'virtual:pgls-module' {
  const create:(options:{wasmBinary:Uint8Array;locateFile?:()=>string})=>Promise<any>;
  export default create;
}
declare module 'virtual:liquid-docs' {
  const documents:Record<string,string>;
  export default documents;
}
