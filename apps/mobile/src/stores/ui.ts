import { create } from "zustand";

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
   * Pager position for the active-sessions bottom accessory (§9.2.1). Purely
   * the accessory's visible index — the session page does not read or drive
   * this value; targeted navigation still goes through `overlaySessionId`.
   */
  activeAccessoryIndex: number;
  setActiveAccessoryIndex: (i: number) => void;
  /**
   * Session id currently targeted by session-entry helpers and optimistic
   * temp→real handoff during session creation. Null = no routed session page
   * is currently being tracked by those helpers.
   */
  overlaySessionId: string | null;
  setOverlaySessionId: (id: string | null) => void;

  /**
   * Registered by whichever header menu (title/actions) is currently open.
   * The standalone session page renders a body-area scrim when non-null so
   * taps in the content region can dismiss the menu — the menu's own
   * in-header backdrop is clipped by ancestor bounds and can't reach the body.
   */
  activeMenuClose: (() => void) | null;
  setActiveMenuClose: (close: (() => void) | null) => void;

  channelDoneBadges: Record<string, boolean>;
  sessionDoneBadges: Record<string, boolean>;
  sessionGroupDoneBadges: Record<string, boolean>;
  markChannelDone: (id: string) => void;
  markSessionDone: (id: string) => void;
  markSessionGroupDone: (id: string) => void;
  clearChannelDone: (id: string) => void;
  clearSessionDone: (id: string) => void;
  clearSessionGroupDone: (id: string) => void;

  /** Repo ID currently selected as the home filter; null = show all repos. */
  homeRepoFilter: string | null;
  setHomeRepoFilter: (id: string | null) => void;

  /**
   * Browser URL override for the currently viewed session group. Null = use
   * that group's default URL (PR or repo).
   */
  browserUrl: string | null;
  browserUrlGroupId: string | null;
  setBrowserUrl: (url: string | null, groupId: string | null) => void;

  reset: () => void;
}

type SetState<T> = (partial: Partial<T> | ((s: T) => Partial<T>)) => void;

const initial = {
  activeChannelId: null as string | null,
  activeSessionId: null as string | null,
  activeSessionGroupId: null as string | null,
  activeAccessoryIndex: 0,
  overlaySessionId: null as string | null,
  activeMenuClose: null as (() => void) | null,
  channelDoneBadges: {} as Record<string, boolean>,
  sessionDoneBadges: {} as Record<string, boolean>,
  sessionGroupDoneBadges: {} as Record<string, boolean>,
  homeRepoFilter: null as string | null,
  browserUrl: null as string | null,
  browserUrlGroupId: null as string | null,
};

export const useMobileUIStore = create<MobileUIState>((set: SetState<MobileUIState>) => ({
  ...initial,

  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setActiveSessionGroupId: (id) => set({ activeSessionGroupId: id }),

  setActiveAccessoryIndex: (i) => set({ activeAccessoryIndex: i }),
  setOverlaySessionId: (id) => set({ overlaySessionId: id }),
  setActiveMenuClose: (close) => set({ activeMenuClose: close }),

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

  setHomeRepoFilter: (id) => set({ homeRepoFilter: id }),

  setBrowserUrl: (url, groupId) => set({ browserUrl: url, browserUrlGroupId: groupId }),

  reset: () => set(initial),
}));
