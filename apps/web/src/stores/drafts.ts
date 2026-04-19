import { create } from "zustand";
import type { ImageAttachment } from "../components/session/ImageAttachmentBar";

export interface SessionDraft {
  html: string;
  images: ImageAttachment[];
}

interface DraftsState {
  drafts: Record<string, SessionDraft>;
  getDraft: (sessionId: string) => SessionDraft;
  setDraftHtml: (sessionId: string, html: string) => void;
  setDraftImages: (
    sessionId: string,
    update: ImageAttachment[] | ((prev: ImageAttachment[]) => ImageAttachment[]),
  ) => void;
  clearDraft: (sessionId: string) => void;
}

const EMPTY_DRAFT: SessionDraft = { html: "", images: [] };

export const useDraftsStore = create<DraftsState>((set, get) => ({
  drafts: {},
  getDraft: (sessionId) => get().drafts[sessionId] ?? EMPTY_DRAFT,
  setDraftHtml: (sessionId, html) => {
    set((state) => {
      const existing = state.drafts[sessionId] ?? EMPTY_DRAFT;
      if (!html && existing.images.length === 0) {
        if (!state.drafts[sessionId]) return state;
        const { [sessionId]: _, ...rest } = state.drafts;
        return { drafts: rest };
      }
      return {
        drafts: { ...state.drafts, [sessionId]: { ...existing, html } },
      };
    });
  },
  setDraftImages: (sessionId, update) => {
    set((state) => {
      const existing = state.drafts[sessionId] ?? EMPTY_DRAFT;
      const nextImages = typeof update === "function" ? update(existing.images) : update;
      if (nextImages.length === 0 && !existing.html) {
        if (!state.drafts[sessionId]) return state;
        const { [sessionId]: _, ...rest } = state.drafts;
        return { drafts: rest };
      }
      return {
        drafts: { ...state.drafts, [sessionId]: { ...existing, images: nextImages } },
      };
    });
  },
  clearDraft: (sessionId) => {
    set((state) => {
      if (!state.drafts[sessionId]) return state;
      const { [sessionId]: _, ...rest } = state.drafts;
      return { drafts: rest };
    });
  },
}));
