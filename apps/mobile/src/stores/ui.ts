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
   * the accessory's visible index — the Session Player (§10.8) does not read
   * or drive this value; Player targeting goes through `overlaySessionId`.
   */
  activeAccessoryIndex: number;
  setActiveAccessoryIndex: (i: number) => void;
  /**
   * Session currently rendered by the Session Player (§10.8). Null = Player
   * closed. Set by any entry point (row tap, accessory tap, deep link) to
   * both target the Player's content and open it.
   */
  overlaySessionId: string | null;
  setOverlaySessionId: (id: string | null) => void;
  sessionPlayerOpen: boolean;
  setSessionPlayerOpen: (open: boolean) => void;

  /**
   * Registered by whichever header menu (title/actions) is currently open.
   * The Session Player renders a full-screen scrim when non-null so taps in
   * the message body can dismiss the menu — the menu's own in-header
   * backdrop is clipped by ancestor bounds and can't reach the body.
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
   * URL currently loaded in the browser panel (Page 1 of SessionPager).
   * Null = use the session's default URL (PR or repo).
   */
  browserUrl: string | null;
  setBrowserUrl: (url: string | null) => void;

  /**
   * True while the user is viewing the browser panel (page 1) in the Session
   * Player. Used to suppress the pull-down dismiss gesture while horizontal
   * pager navigation is active.
   */
  browserPanelActive: boolean;
  setBrowserPanelActive: (active: boolean) => void;

  reset: () => void;
}

type SetState<T> = (partial: Partial<T> | ((s: T) => Partial<T>)) => void;

const initial = {
  activeChannelId: null as string | null,
  activeSessionId: null as string | null,
  activeSessionGroupId: null as string | null,
  activeAccessoryIndex: 0,
  overlaySessionId: null as string | null,
  sessionPlayerOpen: false,
  activeMenuClose: null as (() => void) | null,
  channelDoneBadges: {} as Record<string, boolean>,
  sessionDoneBadges: {} as Record<string, boolean>,
  sessionGroupDoneBadges: {} as Record<string, boolean>,
  homeRepoFilter: null as string | null,
  browserUrl: null as string | null,
  browserPanelActive: false,
};

export const useMobileUIStore = create<MobileUIState>((set: SetState<MobileUIState>) => ({
  ...initial,

  setActiveChannelId: (id) => set({ activeChannelId: id }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setActiveSessionGroupId: (id) => set({ activeSessionGroupId: id }),

  setActiveAccessoryIndex: (i) => set({ activeAccessoryIndex: i }),
  setOverlaySessionId: (id) => set({ overlaySessionId: id }),
  setSessionPlayerOpen: (open) => set({ sessionPlayerOpen: open }),
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

  setBrowserUrl: (url) => set({ browserUrl: url }),
  setBrowserPanelActive: (active) => set({ browserPanelActive: active }),

  reset: () => set(initial),
}));
