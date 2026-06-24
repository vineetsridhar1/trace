import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export interface BrowserTabEntry {
  id: string;
  sessionGroupId: string;
  url: string;
  title: string;
}

export function deriveBrowserTabTitle(url: string): string {
  if (!url) return "New Tab";
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

interface SessionBrowserState {
  browsers: Record<string, BrowserTabEntry>;
  addBrowser: (id: string, sessionGroupId: string, url: string, title?: string) => void;
  setBrowserUrl: (id: string, url: string) => void;
  removeBrowser: (id: string) => void;
}

type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;

export const useSessionBrowserStore = create<SessionBrowserState>(
  (set: SetState<SessionBrowserState>) => ({
    browsers: {},

    addBrowser: (id: string, sessionGroupId: string, url: string, title?: string) =>
      set((state: SessionBrowserState) => ({
        browsers: {
          ...state.browsers,
          [id]: { id, sessionGroupId, url, title: title ?? deriveBrowserTabTitle(url) },
        },
      })),

    setBrowserUrl: (id: string, url: string) =>
      set((state: SessionBrowserState) => {
        const entry = state.browsers[id];
        if (!entry) return {};
        return {
          browsers: {
            ...state.browsers,
            [id]: { ...entry, url, title: deriveBrowserTabTitle(url) },
          },
        };
      }),

    removeBrowser: (id: string) =>
      set((state: SessionBrowserState) => {
        const { [id]: _, ...rest } = state.browsers;
        return { browsers: rest };
      }),
  }),
);

export function useSessionGroupBrowsers(sessionGroupId: string): BrowserTabEntry[] {
  return useSessionBrowserStore(
    useShallow((state: SessionBrowserState) =>
      Object.values(state.browsers).filter(
        (browser: BrowserTabEntry) => browser.sessionGroupId === sessionGroupId,
      ),
    ),
  );
}
