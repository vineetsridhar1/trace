import { create } from "zustand";

export interface SessionPlayerAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Minimal mobile UI state that backs the org-event UI bindings. Tracks
 * the currently focused channel/session/group so handlers can clear them
 * on delete, plus the badge sets used to indicate "needs you" on lists.
 */
export interface MobileUIState {
  activeChannelId: string | null;
  activeSessionId: string | null;
  activeSessionGroupId: string | null;
  setActiveChannelId: (id: string | null) => void;
  setActiveSessionId: (id: string | null) => void;
  setActiveSessionGroupId: (id: string | null) => void;

  /**
   * Shared pager index for the active-sessions accessory (§9.2.1) and the
   * expanded Session Player (§10.8). Swiping in either surface updates this
   * so the other stays in sync.
   */
  activeAccessoryIndex: number;
  setActiveAccessoryIndex: (i: number) => void;
  sessionPlayerOpen: boolean;
  setSessionPlayerOpen: (open: boolean) => void;
  sessionPlayerAnchor: SessionPlayerAnchor | null;
  setSessionPlayerAnchor: (a: SessionPlayerAnchor | null) => void;

  channelDoneBadges: Record<string, boolean>;
  sessionDoneBadges: Record<string, boolean>;
  sessionGroupDoneBadges: Record<string, boolean>;
  markChannelDone: (id: string) => void;
  markSessionDone: (id: string) => void;
  markSessionGroupDone: (id: string) => void;
  clearChannelDone: (id: string) => void;
  clearSessionDone: (id: string) => void;
  clearSessionGroupDone: (id: string) => void;

  reset: () => void;
}

type SetState<T> = (partial: Partial<T> | ((s: T) => Partial<T>)) => void;

const initial = {
  activeChannelId: null as string | null,
  activeSessionId: null as string | null,
  activeSessionGroupId: null as string | null,
  activeAccessoryIndex: 0,
  sessionPlayerOpen: false,
  sessionPlayerAnchor: null as SessionPlayerAnchor | null,
  channelDoneBadges: {} as Record<string, boolean>,
  sessionDoneBadges: {} as Record<string, boolean>,
  sessionGroupDoneBadges: {} as Record<string, boolean>,
};

export const useMobileUIStore = create<MobileUIState>((set: SetState<MobileUIState>) => ({
  ...initial,

  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setActiveSessionGroupId: (id) => set({ activeSessionGroupId: id }),

  setActiveAccessoryIndex: (i) => set({ activeAccessoryIndex: i }),
  setSessionPlayerOpen: (open) => set({ sessionPlayerOpen: open }),
  setSessionPlayerAnchor: (a) => set({ sessionPlayerAnchor: a }),

  markChannelDone: (id) =>
    set((s) => ({ channelDoneBadges: { ...s.channelDoneBadges, [id]: true } })),
  markSessionDone: (id) =>
    set((s) => ({ sessionDoneBadges: { ...s.sessionDoneBadges, [id]: true } })),
  markSessionGroupDone: (id) =>
    set((s) => ({ sessionGroupDoneBadges: { ...s.sessionGroupDoneBadges, [id]: true } })),

  clearChannelDone: (id) =>
    set((s) => {
      const next = { ...s.channelDoneBadges };
      delete next[id];
      return { channelDoneBadges: next };
    }),
  clearSessionDone: (id) =>
    set((s) => {
      const next = { ...s.sessionDoneBadges };
      delete next[id];
      return { sessionDoneBadges: next };
    }),
  clearSessionGroupDone: (id) =>
    set((s) => {
      const next = { ...s.sessionGroupDoneBadges };
      delete next[id];
      return { sessionGroupDoneBadges: next };
    }),

  reset: () => set(initial),
}));
