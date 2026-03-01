import { create } from 'zustand';
import type { Workspace, ServerEvent, SessionStatus } from '../types';
import type { SessionInfo, TokenUsageInfo } from '../hooks/useThread';
import { clamp } from '../utils';

// Registerable async actions provided by useThreadSync
interface ThreadSyncActions {
  loadSessionEvents: (workspace: Workspace) => Promise<void>;
  loadOlderEvents: () => Promise<number>;
  switchSession: (sessionId: string) => Promise<void>;
  clearSession: () => Promise<string | null>;
  deleteWorktree: (onDeleted?: (workspaceId: string) => void) => Promise<void>;
  openThreadPanel: (workspace: Workspace) => void;
  reportClaudeActivity: (workspaceId: string, eventType: string, sessionId?: string) => Promise<void>;
}

const noopWarn = (name: string) => (..._args: unknown[]) => {
  console.warn(`threadStore.${name} called before registration`);
};

const defaultSyncActions: ThreadSyncActions = {
  loadSessionEvents: noopWarn('loadSessionEvents') as ThreadSyncActions['loadSessionEvents'],
  loadOlderEvents: noopWarn('loadOlderEvents') as ThreadSyncActions['loadOlderEvents'],
  switchSession: noopWarn('switchSession') as ThreadSyncActions['switchSession'],
  clearSession: noopWarn('clearSession') as ThreadSyncActions['clearSession'],
  deleteWorktree: noopWarn('deleteWorktree') as ThreadSyncActions['deleteWorktree'],
  openThreadPanel: noopWarn('openThreadPanel') as ThreadSyncActions['openThreadPanel'],
  reportClaudeActivity: noopWarn('reportClaudeActivity') as ThreadSyncActions['reportClaudeActivity'],
};

interface ThreadState {
  // Selection
  selectedWorkspaceId: string | null;
  selectedWorkspace: Workspace | null;

  // Session
  activeSessionId: string | null;
  sessions: SessionInfo[];
  sessionEvents: ServerEvent[];
  sessionStatus: SessionStatus;
  sessionTotal: number;
  loadingOlderEvents: boolean;
  tokenUsage: TokenUsageInfo | null;

  // Thread UI
  threadWidth: number;
  expandedReadGroupIds: Record<string, boolean>;
  expandedTurnGroupIds: Record<string, boolean>;

  // Worktree
  hasWorktree: boolean | null;
  deletingWorktree: boolean;
  mergingWorktree: boolean;

  // Registered sync actions
  syncActions: ThreadSyncActions;
  registerSyncActions: (actions: ThreadSyncActions) => void;
  clearSyncActions: () => void;

  // Actions: Selection
  selectWorkspace: (workspace: Workspace) => void;
  syncSelectedWorkspace: (workspace: Workspace) => void;
  clearSelection: () => void;

  // Actions: Session
  setActiveSessionId: (id: string | null) => void;
  setSessions: (sessions: SessionInfo[]) => void;
  addSession: (session: SessionInfo) => void;
  setSessionEvents: (events: ServerEvent[]) => void;
  appendSessionEvent: (event: ServerEvent) => void;
  updateSessionEvent: (event: ServerEvent) => void;
  setSessionStatus: (status: SessionStatus) => void;
  setSessionTotal: (total: number | ((prev: number) => number)) => void;
  setLoadingOlderEvents: (loading: boolean) => void;
  setTokenUsage: (usage: TokenUsageInfo | null) => void;
  prependSessionEvents: (events: ServerEvent[]) => void;

  // Actions: Thread UI
  setThreadWidth: (width: number) => void;
  openThreadPanelUI: (workspace: Workspace) => void;
  closeThreadPanel: () => void;
  toggleReadGroup: (groupId: string) => void;
  toggleTurnGroup: (groupId: string) => void;
  resetSessionViewState: () => void;

  // Actions: Worktree
  setHasWorktree: (value: boolean | null) => void;
  setDeletingWorktree: (value: boolean) => void;
  setMergingWorktree: (value: boolean) => void;
}

export const useThreadStore = create<ThreadState>((set, get) => ({
  // Selection
  selectedWorkspaceId: null,
  selectedWorkspace: null,

  // Session
  activeSessionId: null,
  sessions: [],
  sessionEvents: [],
  sessionStatus: 'idle',
  sessionTotal: 0,
  loadingOlderEvents: false,
  tokenUsage: null,

  // Thread UI
  threadWidth: 0,
  expandedReadGroupIds: {},
  expandedTurnGroupIds: {},

  // Worktree
  hasWorktree: null,
  deletingWorktree: false,
  mergingWorktree: false,

  // Registered sync actions
  syncActions: { ...defaultSyncActions },
  registerSyncActions: (actions) => set({ syncActions: actions }),
  clearSyncActions: () => set({ syncActions: { ...defaultSyncActions } }),

  // Actions: Selection
  selectWorkspace: (workspace) =>
    set({ selectedWorkspaceId: workspace.id, selectedWorkspace: workspace }),

  syncSelectedWorkspace: (workspace) =>
    set((state) => {
      if (state.selectedWorkspace && state.selectedWorkspace.id === workspace.id) {
        return { selectedWorkspace: workspace };
      }
      return state;
    }),

  clearSelection: () =>
    set({ selectedWorkspaceId: null, selectedWorkspace: null }),

  // Actions: Session
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),

  setSessionEvents: (events) => set({ sessionEvents: events }),

  appendSessionEvent: (event) =>
    set((state) => {
      const sessionEvents = [...state.sessionEvents, event];
      const sessionTotal = state.sessionTotal + 1;
      const activeSessionId = state.activeSessionId;
      const sessions = activeSessionId
        ? state.sessions.map((t) =>
            t.id === activeSessionId ? { ...t, eventCount: t.eventCount + 1 } : t,
          )
        : state.sessions;
      return { sessionEvents, sessionTotal, sessions };
    }),

  updateSessionEvent: (event) =>
    set((state) => {
      const existingIndex = state.sessionEvents.findIndex((e) => e.id === event.id);
      if (existingIndex >= 0) {
        const next = [...state.sessionEvents];
        next[existingIndex] = event;
        return { sessionEvents: next };
      }
      // Upsert behavior
      const next = [...state.sessionEvents, event].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const sessionTotal = Math.max(state.sessionTotal, next.length);
      const activeSessionId = state.activeSessionId;
      const sessions = activeSessionId
        ? state.sessions.map((s) =>
            s.id === activeSessionId
              ? { ...s, eventCount: Math.max(s.eventCount, next.length) }
              : s,
          )
        : state.sessions;
      return { sessionEvents: next, sessionTotal, sessions };
    }),

  setSessionStatus: (status) => set({ sessionStatus: status }),

  setSessionTotal: (total) =>
    set((state) => ({
      sessionTotal: typeof total === 'function' ? total(state.sessionTotal) : total,
    })),

  setLoadingOlderEvents: (loading) => set({ loadingOlderEvents: loading }),

  setTokenUsage: (usage) => set({ tokenUsage: usage }),

  prependSessionEvents: (events) =>
    set((state) => ({
      sessionEvents: [...events, ...state.sessionEvents],
    })),

  // Actions: Thread UI
  setThreadWidth: (width) => set({ threadWidth: width }),

  openThreadPanelUI: (workspace) => {
    const saved = parseInt(localStorage.getItem('trace:threadWidth') ?? '', 10);
    const width = saved >= 280
      ? clamp(saved, 280, window.innerWidth - 200)
      : clamp(Math.floor(window.innerWidth * 0.65), 280, 1600);
    set({
      selectedWorkspaceId: workspace.id,
      selectedWorkspace: workspace,
      hasWorktree: null,
      threadWidth: width,
      // Reset session view state
      expandedReadGroupIds: {},
      expandedTurnGroupIds: {},
      sessionTotal: 0,
      loadingOlderEvents: false,
    });
  },

  closeThreadPanel: () =>
    set({
      selectedWorkspaceId: null,
      selectedWorkspace: null,
      activeSessionId: null,
      sessions: [],
      sessionEvents: [],
      sessionStatus: 'idle',
      threadWidth: 0,
      expandedReadGroupIds: {},
      expandedTurnGroupIds: {},
      sessionTotal: 0,
      loadingOlderEvents: false,
      tokenUsage: null,
    }),

  toggleReadGroup: (groupId) =>
    set((state) => ({
      expandedReadGroupIds: {
        ...state.expandedReadGroupIds,
        [groupId]: !state.expandedReadGroupIds[groupId],
      },
    })),

  toggleTurnGroup: (groupId) =>
    set((state) => ({
      expandedTurnGroupIds: {
        ...state.expandedTurnGroupIds,
        [groupId]: !state.expandedTurnGroupIds[groupId],
      },
    })),

  resetSessionViewState: () =>
    set({
      expandedReadGroupIds: {},
      expandedTurnGroupIds: {},
      sessionTotal: 0,
      loadingOlderEvents: false,
      tokenUsage: null,
    }),

  // Actions: Worktree
  setHasWorktree: (value) => set({ hasWorktree: value }),
  setDeletingWorktree: (value) => set({ deletingWorktree: value }),
  setMergingWorktree: (value) => set({ mergingWorktree: value }),
}));
