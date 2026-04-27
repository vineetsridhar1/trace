import { create } from "zustand";
import type { ImageAttachment } from "../components/session/ImageAttachmentBar";

export interface SessionDraft {
  html: string;
  text: string;
  images: ImageAttachment[];
}

interface DraftsState {
  drafts: Record<string, SessionDraft>;
  setDraftText: (sessionId: string, text: string, html: string) => void;
  setDraftImages: (
    sessionId: string,
    update: ImageAttachment[] | ((prev: ImageAttachment[]) => ImageAttachment[]),
  ) => void;
}

const EMPTY: SessionDraft = { html: "", text: "", images: [] };

function isEmpty(draft: SessionDraft): boolean {
  return !draft.text && draft.images.length === 0;
}

function upsert(drafts: Record<string, SessionDraft>, sessionId: string, next: SessionDraft) {
  if (isEmpty(next)) {
    if (!drafts[sessionId]) return { drafts };
    const { [sessionId]: _, ...rest } = drafts;
    return { drafts: rest };
  }
  return { drafts: { ...drafts, [sessionId]: next } };
}

export const useDraftsStore = create<DraftsState>((set) => ({
  drafts: {},
  setDraftText: (sessionId, text, html) => {
    set((state) => {
      const existing = state.drafts[sessionId] ?? EMPTY;
      return upsert(state.drafts, sessionId, { ...existing, text, html });
    });
  },
  setDraftImages: (sessionId, update) => {
    set((state) => {
      const existing = state.drafts[sessionId] ?? EMPTY;
      const nextImages = typeof update === "function" ? update(existing.images) : update;
      return upsert(state.drafts, sessionId, { ...existing, images: nextImages });
    });
  },
}));
