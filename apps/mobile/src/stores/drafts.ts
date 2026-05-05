import { useEntityStore } from "@trace/client-core";
import { create } from "zustand";

/**
 * Mobile attachment draft. Unlike the web version, mobile attachments don't
 * carry a `File` — RN doesn't have one. Pickers give us local URIs while the
 * clipboard only exposes base64 data. We store whichever the source produced
 * and convert at upload time.
 */
export interface FileAttachment {
  id: string;
  filename: string;
  mimeType: string;
  /** Raw base64 (no `data:` prefix). Set when the image came from clipboard. */
  base64?: string;
  /** Local file URI. Set when the attachment came from a system picker. */
  fileUri?: string;
  /** `data:` URL or `file://` URI for image previews. */
  previewUri?: string;
  width: number | null;
  height: number | null;
  s3Key: string | null;
  uploading: boolean;
}

interface DraftsState {
  attachments: Record<string, FileAttachment[]>;
  setAttachments: (
    sessionId: string,
    update: FileAttachment[] | ((prev: FileAttachment[]) => FileAttachment[]),
  ) => void;
  clear: (sessionId: string) => void;
}

const EMPTY: FileAttachment[] = [];

export const useDraftsStore = create<DraftsState>((set) => ({
  attachments: {},
  setAttachments: (sessionId, update) => {
    set((state) => {
      const prev = state.attachments[sessionId] ?? EMPTY;
      const next = typeof update === "function" ? update(prev) : update;
      if (next.length === 0) {
        if (!state.attachments[sessionId]) return state;
        const { [sessionId]: _removed, ...rest } = state.attachments;
        return { attachments: rest };
      }
      return { attachments: { ...state.attachments, [sessionId]: next } };
    });
  },
  clear: (sessionId) => {
    set((state) => {
      if (!state.attachments[sessionId]) return state;
      const { [sessionId]: _removed, ...rest } = state.attachments;
      return { attachments: rest };
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
  const draftIds = Object.keys(useDraftsStore.getState().attachments);
  if (draftIds.length === 0) return;
  for (const id of draftIds) {
    if (prevState.sessions[id] && !state.sessions[id]) {
      useDraftsStore.getState().clear(id);
    }
  }
});
