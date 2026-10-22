// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type {Text} from '@codemirror/state';

/** The bitmap's actual logical rows, shared with pointer navigation. */
export interface MinimapGeometry {
  document:Text;
  rows:readonly {line:number}[];
  lineHeight:number;
  padding:number;
  offset:number;
  height:number;
  overlayHeight:number;
}

export const minimapGeometry=new WeakMap<HTMLElement,MinimapGeometry>();
