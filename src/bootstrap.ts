// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export function startApplication<TComponent, TResult>(
  documentRef: Document,
  component: TComponent,
  mountComponent: (
    component: TComponent,
    options: { target: Element }
  ) => TResult
): TResult
{
  const target = documentRef.querySelector("#app");

  if (!target)
  {
    throw new Error("Missing #app element");
  }

  return mountComponent(component, { target });
}
