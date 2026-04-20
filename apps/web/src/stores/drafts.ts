import { create } from "zustand";
import type { ImageAttachment } from "../components/session/ImageAttachmentBar";
import type { InteractionMode } from "../components/session/interactionModes";
import { useEntityStore } from "./entity";

export interface SessionDraft {
  html: string;
  text: string;
  images: ImageAttachment[];
  mode: InteractionMode;
}

const DEFAULT_MODE: InteractionMode = "code";
const DEFAULT_DRAFT: SessionDraft = Object.freeze({
  html: "",
  text: "",
  images: Object.freeze([] as ImageAttachment[]) as ImageAttachment[],
  mode: DEFAULT_MODE,
}) as SessionDraft;

function isDefaultDraft(draft: SessionDraft): boolean {
  return (
    !draft.text &&
    draft.images.length === 0 &&
    draft.mode === DEFAULT_MODE
  );
}

interface DraftsState {
  drafts: Record<string, SessionDraft>;
  setDraftText: (sessionId: string, text: string, html: string) => void;
  setDraftImages: (
    sessionId: string,
    update: ImageAttachment[] | ((prev: ImageAttachment[]) => ImageAttachment[]),
  ) => void;
  setDraftMode: (sessionId: string, mode: InteractionMode) => void;
}

export const useDraftsStore = create<DraftsState>((set) => ({
  drafts: {},
  setDraftText: (sessionId, text, html) => {
    set((state) => {
      const existing = state.drafts[sessionId] ?? DEFAULT_DRAFT;
      const next: SessionDraft = { ...existing, html, text };
      return upsertOrDelete(state.drafts, sessionId, next);
    });
  },
  setDraftImages: (sessionId, update) => {
    set((state) => {
      const existing = state.drafts[sessionId] ?? DEFAULT_DRAFT;
      const nextImages = typeof update === "function" ? update(existing.images) : update;
      const next: SessionDraft = { ...existing, images: nextImages };
      return upsertOrDelete(state.drafts, sessionId, next);
    });
  },
  setDraftMode: (sessionId, mode) => {
    set((state) => {
      const existing = state.drafts[sessionId] ?? DEFAULT_DRAFT;
      const next: SessionDraft = { ...existing, mode };
      return upsertOrDelete(state.drafts, sessionId, next);
    });
  },
}));

function upsertOrDelete(
  drafts: Record<string, SessionDraft>,
  sessionId: string,
  next: SessionDraft,
): { drafts: Record<string, SessionDraft> } | Record<string, never> {
  if (isDefaultDraft(next)) {
    if (!drafts[sessionId]) return {};
    const { [sessionId]: _, ...rest } = drafts;
    return { drafts: rest };
  }
  return { drafts: { ...drafts, [sessionId]: next } };
}

// Drop drafts (and revoke their image blob URLs) when their session is removed
// from the entity store. Without this, attaching an image then deleting the
// session would leak the blob URL until page reload.
let lastSessions = useEntityStore.getState().sessions;
useEntityStore.subscribe((state) => {
  if (state.sessions === lastSessions) return;
  const prev = lastSessions;
  lastSessions = state.sessions;
  const drafts = useDraftsStore.getState().drafts;
  let removed: string[] | null = null;
  for (const sessionId of Object.keys(drafts)) {
    if (prev[sessionId] && !state.sessions[sessionId]) {
      for (const img of drafts[sessionId].images) {
        URL.revokeObjectURL(img.previewUrl);
      }
      (removed ??= []).push(sessionId);
    }
  }
  if (!removed) return;
  useDraftsStore.setState((s) => {
    const next = { ...s.drafts };
    for (const id of removed) delete next[id];
    return { drafts: next };
  });
});
