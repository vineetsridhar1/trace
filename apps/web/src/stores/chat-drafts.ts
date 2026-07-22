import { create } from "zustand";

export interface ChatDraft {
  text: string;
  html: string;
}

interface ChatDraftState {
  drafts: Record<string, ChatDraft>;
  setDraft: (chatId: string, draft: ChatDraft) => void;
}

export const useChatDraftStore = create<ChatDraftState>((set) => ({
  drafts: {},
  setDraft: (chatId, draft) =>
    set((state) => {
      if (!draft.text.trim()) {
        const { [chatId]: _, ...drafts } = state.drafts;
        return { drafts };
      }
      return { drafts: { ...state.drafts, [chatId]: draft } };
    }),
}));
