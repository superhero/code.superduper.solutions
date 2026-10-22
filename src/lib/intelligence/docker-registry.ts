// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
/** Deliberately offline: language analysis must never contact Docker Hub. */
export class DockerRegistryClient {
  async getTags(_image:string,_prefix?:string):Promise<string[]>{return [];}
}
