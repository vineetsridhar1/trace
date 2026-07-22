import { create } from "zustand";

// Transient channel for one component to seed another's composer (e.g. an empty-state
// starter prompt filling — or sending through — the session input). The composer
// consumes and clears the request; nothing here is persisted.
export interface ComposerPrefill {
  text: string;
  // When true, the composer submits the text immediately instead of just filling it.
  send: boolean;
}

interface ComposerState {
  prefillBySession: Record<string, ComposerPrefill>;
  scrollToBottomBySession: Record<string, number>;
  requestPrefill: (sessionId: string, text: string, send?: boolean) => void;
  requestScrollToBottom: (sessionId: string) => void;
  consumePrefill: (sessionId: string) => void;
}

export const useComposerStore = create<ComposerState>((set) => ({
  prefillBySession: {},
  scrollToBottomBySession: {},
  requestPrefill: (sessionId, text, send = false) =>
    set((state) => ({
      prefillBySession: { ...state.prefillBySession, [sessionId]: { text, send } },
    })),
  requestScrollToBottom: (sessionId) =>
    set((state) => ({
      scrollToBottomBySession: {
        ...state.scrollToBottomBySession,
        [sessionId]: (state.scrollToBottomBySession[sessionId] ?? 0) + 1,
      },
    })),
  consumePrefill: (sessionId) =>
    set((state) => {
      if (!(sessionId in state.prefillBySession)) return state;
      const { [sessionId]: _removed, ...rest } = state.prefillBySession;
      return { prefillBySession: rest };
    }),
}));
