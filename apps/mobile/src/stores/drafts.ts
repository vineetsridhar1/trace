import { create } from "zustand";

/**
 * Mobile image draft. Unlike the web version, mobile attachments don't
 * carry a `File` — RN doesn't have one. We store the base64-encoded bytes
 * alongside the MIME type so the uploader can POST them to S3 directly.
 * `previewUri` is a `data:` URL ready to feed straight into <Image>.
 */
export interface ImageAttachment {
  id: string;
  mimeType: string;
  base64: string;
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
