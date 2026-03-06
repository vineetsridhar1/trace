import { useCallback, useRef, useState } from "react";
import { gql } from "@apollo/client";
import type { Workspace, ServerEvent, SessionStatus } from "../types";
import {
  useCreateSessionMutation,
  useSessionsLazyQuery,
  useSessionEventsLazyQuery,
} from "./__generated__/useThread.generated";
import { clamp } from "../utils";
import { useWorktreeState } from "./useWorktreeState";
import { useThreadSelection } from "./useThreadSelection";

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

const GQL_SESSIONS = gql`
  query Sessions($channelId: ID!, $workspaceId: ID!) {
    sessions(channelId: $channelId, workspaceId: $workspaceId) {
      id
      workspaceId
      createdAt
      eventCount
    }
  }
`;

const GQL_SESSION_EVENTS = gql`
  query SessionEvents(
    $channelId: ID!
    $workspaceId: ID!
    $sessionId: ID!
    $limit: Int
    $offset: Int
    $after: String
  ) {
    sessionEvents(
      channelId: $channelId
      workspaceId: $workspaceId
      sessionId: $sessionId
      limit: $limit
      offset: $offset
      after: $after
    ) {
      events {
        id
        cliSessionId
        hookEventName
        timestamp
        toolName
        toolInput
        toolResponse
        toolUseId
        stopHookActive
        lastAssistantMessage
        rawPayload
        sessionId
        importance
      }
      total
      limit
      offset
      tokenUsage {
        inputTokens
        outputTokens
        totalTokens
      }
      cliCostUsd
    }
  }
`;

const GQL_CREATE_SESSION = gql`
  mutation CreateSession($channelId: ID!, $workspaceId: ID!) {
    createSession(channelId: $channelId, workspaceId: $workspaceId) {
      id
      workspaceId
      createdAt
      eventCount
    }
  }
`;

interface UseThreadOptions {
  getChannelRepoPath: () => string;
  getChannelBaseBranch: () => string;
  getChannelTeardownCommands?: () => string[] | undefined;
  getActiveChannelId: () => string | null;
}

const SESSION_PAGE_SIZE = 100;

export function useThread({
  getChannelRepoPath,
  getChannelBaseBranch,
  getChannelTeardownCommands,
  getActiveChannelId,
}: UseThreadOptions) {
  const [executeSessions] = useSessionsLazyQuery();
  const [executeSessionEvents] = useSessionEventsLazyQuery();
  const [executeCreateSession] = useCreateSessionMutation();

  // Composed hooks
  const {
    selectedWorkspaceId,
    selectedWorkspace,
    selectedWorkspaceRef,
    selectedWorkspaceIdRef,
    syncSelectedWorkspace,
    clearSelection,
    selectWorkspace,
  } = useThreadSelection();
  const {
    hasWorktree,
    setHasWorktree,
    deletingWorktree,
    mergingWorktree,
    checkWorktree,
    deleteWorktree,
    mergeWorktree,
  } = useWorktreeState({
    getChannelRepoPath,
    getChannelBaseBranch,
    getChannelTeardownCommands,
    selectedWorkspaceRef,
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionEvents, setSessionEvents] = useState<ServerEvent[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("idle");
  const [threadWidth, setThreadWidth] = useState(0);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [expandedReadGroupIds, setExpandedReadGroupIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedTurnGroupIds, setExpandedTurnGroupIds] = useState<
    Record<string, boolean>
  >({});
  const [sessionTotal, setSessionTotal] = useState(0);
  const [loadingOlderEvents, setLoadingOlderEvents] = useState(false);

  const activeSessionIdRef = useRef<string | null>(null);
  const lastReportedSessionEventIdByWorkspaceRef = useRef<Map<string, string>>(
    new Map(),
  );
  const loadingOlderRef = useRef(false);
  const sessionQueryRef = useRef<{
    channelId: string;
    workspaceId: string;
    sessionId: string;
  } | null>(null);
  const sessionEventsLengthRef = useRef(0);
  const sessionEventsRef = useRef<ServerEvent[]>([]);
  sessionEventsLengthRef.current = sessionEvents.length;
  sessionEventsRef.current = sessionEvents;

  activeSessionIdRef.current = activeSessionId;

  const threadOpen = threadWidth > 0;

  const reportAgentActivity = useCallback(
    async (workspaceId: string, eventType: string, sessionId?: string) => {
      if (
        !window.traceAPI ||
        typeof window.traceAPI.reportAgentActivity !== "function"
      )
        return;
      try {
        await window.traceAPI.reportAgentActivity(workspaceId, eventType, sessionId);
      } catch {
        // best-effort
      }
    },
    [],
  );

  const resetSessionViewState = useCallback(() => {
    setShowJumpToLatest(false);
    setExpandedReadGroupIds({});
    setExpandedTurnGroupIds({});
    setSessionTotal(0);
    setLoadingOlderEvents(false);
    loadingOlderRef.current = false;
    sessionQueryRef.current = null;
  }, []);

  const closeThreadPanel = useCallback(() => {
    clearSelection();
    setActiveSessionId(null);
    setSessions([]);
    setSessionEvents([]);
    setSessionStatus("idle");
    setThreadWidth(0);
    resetSessionViewState();
  }, [resetSessionViewState, clearSelection]);

  // Load events for a specific session by ID
  const loadEventsForSession = useCallback(
    async (channelId: string, workspaceId: string, sessionId: string) => {
      resetSessionViewState();

      const { data: eventsData } = await executeSessionEvents({
        variables: {
          channelId,
          workspaceId,
          sessionId,
          limit: SESSION_PAGE_SIZE,
        },
      });

      const result = eventsData?.sessionEvents;
      const events: ServerEvent[] = (result?.events ?? []) as ServerEvent[];
      const total = result?.total ?? events.length;
      setSessionEvents(events);
      setSessionTotal(total);
      sessionQueryRef.current = { channelId, workspaceId, sessionId };
      setSessionStatus(events.length === 0 ? "empty" : "ready");
    },
    [executeSessionEvents, resetSessionViewState],
  );

  const loadSessionEvents = useCallback(
    async (workspace: Workspace) => {
      try {
        setSessionStatus((prev) =>
          prev === "idle" || prev === "error" ? "loading" : prev,
        );

        const { data: sessionsData } = await executeSessions({
          variables: {
            channelId: workspace.channelId,
            workspaceId: workspace.id,
          },
        });

        const sessionList = (sessionsData?.sessions ?? []) as SessionInfo[];
        setSessions(sessionList);

        if (sessionList.length === 0) {
          setActiveSessionId(null);
          setSessionEvents([]);
          setSessionStatus("empty");
          return;
        }

        const latestSession = sessionList[sessionList.length - 1];
        setActiveSessionId(latestSession.id);
        await loadEventsForSession(workspace.channelId, workspace.id, latestSession.id);

        const latestEvent =
          sessionEventsRef.current[sessionEventsRef.current.length - 1];
        if (latestEvent) {
          const lastReportedId =
            lastReportedSessionEventIdByWorkspaceRef.current.get(workspace.id);
          if (lastReportedId !== latestEvent.id) {
            lastReportedSessionEventIdByWorkspaceRef.current.set(
              workspace.id,
              latestEvent.id,
            );
            void reportAgentActivity(workspace.id, latestEvent.hookEventName, latestEvent.cliSessionId);
          }
        }
      } catch {
        setSessionStatus("error");
      }
    },
    [executeSessions, loadEventsForSession, reportAgentActivity],
  );

  const loadOlderEvents = useCallback(async (): Promise<number> => {
    const query = sessionQueryRef.current;
    if (loadingOlderRef.current || !query) return 0;
    loadingOlderRef.current = true;
    setLoadingOlderEvents(true);
    try {
      const { data } = await executeSessionEvents({
        variables: {
          channelId: query.channelId,
          workspaceId: query.workspaceId,
          sessionId: query.sessionId,
          limit: SESSION_PAGE_SIZE,
          offset: sessionEventsLengthRef.current,
        },
      });

      const result = data?.sessionEvents;
      const olderEvents: ServerEvent[] = (result?.events ??
        []) as ServerEvent[];
      const total = result?.total;
      if (total != null) setSessionTotal(total);
      if (olderEvents.length > 0) {
        setSessionEvents((prev) => [...olderEvents, ...prev]);
      }
      return olderEvents.length;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderEvents(false);
    }
  }, [executeSessionEvents]);

  const appendSessionEvent = useCallback(
    (event: ServerEvent) => {
      setSessionEvents((prev) => [...prev, event]);
      setSessionTotal((prev) => prev + 1);

      const currentSessionId = activeSessionIdRef.current;
      if (currentSessionId) {
        setSessions((prev) =>
          prev.map((t) =>
            t.id === currentSessionId ? { ...t, eventCount: t.eventCount + 1 } : t,
          ),
        );
      }

    },
    [],
  );

  const updateSessionEvent = useCallback(
    (event: ServerEvent) => {
      setSessionEvents((prev) => {
        const existingIndex = prev.findIndex((e) => e.id === event.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = event;
          return next;
        }

        // Upsert behavior: updated events can arrive without a prior created
        // event (e.g. deduped Stop merge path), so append when missing.
        const next = [...prev, event].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        setSessionTotal((total) => Math.max(total, next.length));
        const currentSessionId = activeSessionIdRef.current;
        if (currentSessionId) {
          setSessions((sessionsPrev) =>
            sessionsPrev.map((s) =>
              s.id === currentSessionId
                ? { ...s, eventCount: Math.max(s.eventCount, next.length) }
                : s,
            ),
          );
        }

        return next;
      });
    },
    [],
  );

  const hasMoreEvents = sessionTotal > sessionEvents.length;

  const openThreadPanel = useCallback(
    (workspace: Workspace) => {
      selectWorkspace(workspace);
      setHasWorktree(null);
      const saved = parseInt(localStorage.getItem('trace:threadWidth') ?? '', 10);
      const width = saved >= 280
        ? clamp(saved, 280, window.innerWidth - 200)
        : clamp(Math.floor(window.innerWidth * 0.65), 280, 1600);
      setThreadWidth(width);
      resetSessionViewState();
      void loadSessionEvents(workspace);
      void checkWorktree(workspace.id);
    },
    [loadSessionEvents, resetSessionViewState, checkWorktree, selectWorkspace],
  );

  const switchSession = useCallback(
    async (sessionId: string) => {
      const workspace = selectedWorkspaceRef.current;
      if (!workspace) return;

      setActiveSessionId(sessionId);
      setSessionStatus("loading");

      try {
        await loadEventsForSession(workspace.channelId, workspace.id, sessionId);
      } catch {
        setSessionStatus("error");
      }
    },
    [loadEventsForSession],
  );

  const clearSession = useCallback(async (): Promise<string | null> => {
    const workspace = selectedWorkspaceRef.current;
    const channelId = getActiveChannelId();
    if (!workspace || !channelId) return null;

    try {
      const { data } = await executeCreateSession({
        variables: {
          channelId,
          workspaceId: workspace.id,
        },
      });

      const newSession = data?.createSession as SessionInfo | undefined;
      if (!newSession) return null;

      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(newSession.id);
      activeSessionIdRef.current = newSession.id;
      setSessionEvents([]);
      setSessionTotal(0);
      setSessionStatus("empty");
      resetSessionViewState();
      sessionQueryRef.current = {
        channelId,
        workspaceId: workspace.id,
        sessionId: newSession.id,
      };
      return newSession.id;
    } catch (err) {
      console.error("Failed to clear session:", err);
      return null;
    }
  }, [executeCreateSession, getActiveChannelId, resetSessionViewState]);

  const toggleReadGroup = useCallback((groupId: string) => {
    setExpandedReadGroupIds((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  const toggleTurnGroup = useCallback((groupId: string) => {
    setExpandedTurnGroupIds((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }, []);

  return {
    selectedWorkspaceId,
    selectedWorkspace,
    selectedWorkspaceRef,
    selectedWorkspaceIdRef,
    activeSessionId,
    activeSessionIdRef,
    sessions,
    sessionEvents,
    sessionEventsRef,
    sessionStatus,
    threadWidth,
    setThreadWidth,
    threadOpen,
    deletingWorktree,
    mergingWorktree,
    hasWorktree,
    setHasWorktree,
    showJumpToLatest,
    setShowJumpToLatest,
    expandedReadGroupIds,
    expandedTurnGroupIds,
    reportAgentActivity,
    closeThreadPanel,
    loadSessionEvents,
    loadOlderEvents,
    appendSessionEvent,
    updateSessionEvent,
    hasMoreEvents,
    loadingOlderEvents,
    openThreadPanel,
    switchSession,
    clearSession,
    deleteWorktree,
    mergeWorktree,
    toggleReadGroup,
    toggleTurnGroup,
    syncSelectedWorkspace,
  };
}
