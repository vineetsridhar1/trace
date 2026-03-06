import { create } from 'zustand';
import type { Workspace, ServerEvent, SessionStatus } from '../types';

export type ThreadViewMode = 'agent' | 'ticket' | 'files' | 'terminal' | 'browser';

export interface SessionInfo {
  id: string;
  workspaceId: string;
  createdAt: string;
  eventCount: number;
}

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cliCostUsd?: number;
}

// Registerable async actions provided by useThreadSync
interface ThreadSyncActions {
  loadSessionEvents: (workspace: Workspace) => Promise<void>;
  loadOlderEvents: () => Promise<number>;
  switchSession: (sessionId: string) => Promise<void>;
  clearSession: () => Promise<string | null>;
  openThreadPanel: (workspace: Workspace) => void;
  reportAgentActivity: (workspaceId: string, eventType: string, sessionId?: string) => Promise<void>;
}

const noopWarn = (_name: string) => (..._args: unknown[]) => {};

const defaultSyncActions: ThreadSyncActions = {
  loadSessionEvents: noopWarn('loadSessionEvents') as ThreadSyncActions['loadSessionEvents'],
  loadOlderEvents: noopWarn('loadOlderEvents') as ThreadSyncActions['loadOlderEvents'],
  switchSession: noopWarn('switchSession') as ThreadSyncActions['switchSession'],
  clearSession: noopWarn('clearSession') as ThreadSyncActions['clearSession'],
  openThreadPanel: noopWarn('openThreadPanel') as ThreadSyncActions['openThreadPanel'],
  reportAgentActivity: noopWarn('reportAgentActivity') as ThreadSyncActions['reportAgentActivity'],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

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
  threadViewMode: ThreadViewMode;
  expandedReadGroupIds: Record<string, boolean>;
  expandedTurnGroupIds: Record<string, boolean>;

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
  setThreadViewMode: (mode: ThreadViewMode) => void;
  openThreadPanelUI: (workspace: Workspace) => void;
  closeThreadPanel: () => void;
  toggleReadGroup: (groupId: string) => void;
  toggleTurnGroup: (groupId: string) => void;
  resetSessionViewState: () => void;
}

export const useThreadStore = create<ThreadState>()((set) => ({
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
  threadViewMode: 'agent',
  expandedReadGroupIds: {},
  expandedTurnGroupIds: {},

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
  setThreadViewMode: (mode) => set({ threadViewMode: mode }),

  openThreadPanelUI: (workspace) => {
    const saved = parseInt(localStorage.getItem('trace:threadWidth') ?? '', 10);
    const width = saved >= 280
      ? clamp(saved, 280, window.innerWidth - 200)
      : clamp(Math.floor(window.innerWidth * 0.65), 280, 1600);
    set({
      selectedWorkspaceId: workspace.id,
      selectedWorkspace: workspace,
      threadWidth: width,
      // Reset session view state
      expandedReadGroupIds: {},
      expandedTurnGroupIds: {},
      sessionTotal: 0,
      loadingOlderEvents: false,
      // Clear stale session data and show loading immediately
      sessionEvents: [],
      sessions: [],
      activeSessionId: null,
      sessionStatus: 'loading',
      tokenUsage: null,
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
}));
