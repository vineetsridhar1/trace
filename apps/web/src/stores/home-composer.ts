import { create } from "zustand";

interface HomeComposerPrefill {
  id: number;
  text: string;
}

interface HomeComposerState {
  focusRequest: number;
  prefill: HomeComposerPrefill | null;
  drafts: Record<string, string>;
  requestFocus: (text?: string) => void;
  consumePrefill: (id: number) => void;
  setDraft: (scope: string, text: string) => void;
  clearDraft: (scope: string) => void;
}

export const useHomeComposerStore = create<HomeComposerState>((set) => ({
  focusRequest: 0,
  prefill: null,
  drafts: {},
  requestFocus: (text) =>
    set((state) => {
      const request = state.focusRequest + 1;
      return {
        focusRequest: request,
        prefill: text === undefined ? null : { id: request, text },
      };
    }),
  consumePrefill: (id) => set((state) => (state.prefill?.id === id ? { prefill: null } : {})),
  setDraft: (scope, text) =>
    set((state) => {
      if (state.drafts[scope] === text) return {};
      if (!text) {
        const { [scope]: _, ...drafts } = state.drafts;
        return { drafts };
      }
      return { drafts: { ...state.drafts, [scope]: text } };
    }),
  clearDraft: (scope) =>
    set((state) => {
      if (!(scope in state.drafts)) return {};
      const { [scope]: _, ...drafts } = state.drafts;
      return { drafts };
    }),
}));

export function homeComposerDraftScope(
  userId: string | null | undefined,
  organizationId: string | null,
): string {
  return `${userId ?? "anonymous"}:${organizationId ?? "no-organization"}`;
}
