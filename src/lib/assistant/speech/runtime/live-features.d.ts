// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export class LiveFeatures {
  constructor(nMels?: number, port?: MessagePort | null, worker?: Worker | null);
  connect(): MessagePort;
  push(pcm: Float32Array): void;
  close(): void;
}
