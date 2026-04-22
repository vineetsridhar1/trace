import { useEntityStore } from "@trace/client-core";
import { create } from "zustand";

/**
 * Mobile image draft. Unlike the web version, mobile attachments don't
 * carry a `File` — RN doesn't have one. The gallery picker gives us a
 * local file URI that stays in the platform's image cache; the clipboard
 * only exposes base64 data. We store whichever the source produced and
 * convert at upload time, so a 5MB screenshot picked from the library
 * doesn't balloon Zustand state by ~7MB of base64.
 */
export interface ImageAttachment {
  id: string;
  mimeType: string;
  /** Raw base64 (no `data:` prefix). Set when the image came from clipboard. */
  base64?: string;
  /** Local file URI. Set when the image came from the gallery picker. */
  fileUri?: string;
  /** `data:` URL or `file://` URI — both work as `<Image source={{ uri }}>`. */
  previewUri: string;
  width: number | null;
  height: number | null;
  s3Key: string | null;
  uploading: boolean;
}

interface DraftsState {
  images: Record<string, ImageAttachment[]>;
  setImages: (
    sessionId: string,
    update: ImageAttachment[] | ((prev: ImageAttachment[]) => ImageAttachment[]),
  ) => void;
  clear: (sessionId: string) => void;
}

const EMPTY: ImageAttachment[] = [];

export const useDraftsStore = create<DraftsState>((set) => ({
  images: {},
  setImages: (sessionId, update) => {
    set((state) => {
      const prev = state.images[sessionId] ?? EMPTY;
      const next = typeof update === "function" ? update(prev) : update;
      if (next.length === 0) {
        if (!state.images[sessionId]) return state;
        const { [sessionId]: _removed, ...rest } = state.images;
        return { images: rest };
      }
      return { images: { ...state.images, [sessionId]: next } };
    });
  },
  clear: (sessionId) => {
    set((state) => {
      if (!state.images[sessionId]) return state;
      const { [sessionId]: _removed, ...rest } = state.images;
      return { images: rest };
    });
  },
}));

// Drafts live in memory per session id. When a session is removed from the
// entity store (deleted, merged, etc.), its draft entry should go too —
// otherwise base64 payloads leak until process restart. Cheap reference
// check on every entity store change keeps this near-free in the common
// case where sessions didn't move.
useEntityStore.subscribe((state, prevState) => {
  if (state.sessions === prevState.sessions) return;
  const draftIds = Object.keys(useDraftsStore.getState().images);
  if (draftIds.length === 0) return;
  for (const id of draftIds) {
    if (prevState.sessions[id] && !state.sessions[id]) {
      useDraftsStore.getState().clear(id);
    }
  }
});
