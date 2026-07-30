import { create } from "zustand";

interface HomeComposerPrefill {
  id: number;
  text: string;
}

interface HomeComposerState {
  focusRequest: number;
  prefill: HomeComposerPrefill | null;
  requestFocus: (text?: string) => void;
  consumePrefill: (id: number) => void;
}

export const useHomeComposerStore = create<HomeComposerState>((set) => ({
  focusRequest: 0,
  prefill: null,
  requestFocus: (text) =>
    set((state) => {
      const request = state.focusRequest + 1;
      return {
        focusRequest: request,
        prefill: text ? { id: request, text } : state.prefill,
      };
    }),
  consumePrefill: (id) => set((state) => (state.prefill?.id === id ? { prefill: null } : {})),
}));
