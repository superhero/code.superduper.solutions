// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
import type { ChatImage, ChatMessage } from '../ollama.ts';
/** Pixel payloads stay in memory; only IDs and dimensions reach the text model. */
export function imageReferences(conversation: readonly ChatMessage[]) {
  const images = new Map<string, {id: string; width: number; height: number; image: ChatImage}>();
  for (const message of conversation) for (const image of message.images ?? []) {
    const key = `${image.mimeType}:${image.data}`;
    if (!images.has(key)) images.set(key, {id: `image_${images.size + 1}`, width: image.width ?? 0, height: image.height ?? 0, image});
  }
  if (images.size > 3) throw new Error('This vision tool supports three images per conversation. Start a new chat to inspect more.');
  return {
    getImage: (id: string) => {const item = [...images.values()].find(image => image.id === id); return item ? {...item.image, width: item.width, height: item.height} : undefined;},
    reference(image: ChatImage) {
      const item = images.get(`${image.mimeType}:${image.data}`);
      if (!item) throw new Error('The image is no longer available in this conversation.');
      return `[Local image: ${item.id}; ${item.width} × ${item.height} pixels. Use inspect_image with this image_id and a targeted question to see its pixels.]`;
    },
  };
}
