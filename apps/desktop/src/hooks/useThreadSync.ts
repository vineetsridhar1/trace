import { useCallback, useEffect, useRef } from "react";
import type { Workspace, ServerEvent } from "../types";
import type { SessionInfo } from "./useThread";
import {
  useCreateSessionMutation,
  useSessionsLazyQuery,
  useSessionEventsLazyQuery,
} from "./__generated__/useThread.generated";
import { useThreadStore } from "../stores/threadStore";

const SESSION_PAGE_SIZE = 100;

export function useThreadSync(
  getActiveChannelId: () => string | null,
  getChannelRepoPath: () => string,
  getChannelBaseBranch: () => string,
  getChannelTeardownCommands?: () => string[] | undefined,
) {
  const [executeSessions] = useSessionsLazyQuery();
  const [executeSessionEvents] = useSessionEventsLazyQuery();
  const [executeCreateSession] = useCreateSessionMutation();

  const lastReportedSessionEventIdByWorkspaceRef = useRef<Map<string, string>>(
    new Map(),
  );
  const loadingOlderRef = useRef(false);
  const sessionQueryRef = useRef<{
    channelId: string;
    workspaceId: string;
    sessionId: string;
  } | null>(null);
  const asyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportAgentActivity = useCallback(
    async (workspaceId: string, eventType: string, sessionId?: string) => {
      if (
        !window.traceAPI ||
        typeof window.traceAPI.reportAgentActivity !== "function"
      )
        return;
      try {
        await window.traceAPI.reportAgentActivity(
          workspaceId,
          eventType,
          sessionId,
        );
      } catch {
        // best-effort
      }
    },
    [],
  );

  const applyEventsResult = useCallback(
    (
      channelId: string,
      workspaceId: string,
      sessionId: string,
      result:
        | {
            events?: unknown[];
            total?: number;
            tokenUsage?: {
              inputTokens: number;
              outputTokens: number;
              totalTokens: number;
            } | null;
            cliCostUsd?: number | null;
          }
        | undefined,
    ) => {
      const events: ServerEvent[] = (result?.events ?? []) as ServerEvent[];
      const total = result?.total ?? events.length;
      const store = useThreadStore.getState();
      store.setSessionEvents(events);
      store.setSessionTotal(total);
      if (result?.tokenUsage) {
        store.setTokenUsage({
          inputTokens: result.tokenUsage.inputTokens,
          outputTokens: result.tokenUsage.outputTokens,
          totalTokens: result.tokenUsage.totalTokens,
          cliCostUsd: result.cliCostUsd ?? undefined,
        });
      }
      sessionQueryRef.current = { channelId, workspaceId, sessionId };
      store.setSessionStatus(events.length === 0 ? "empty" : "ready");
    },
    [],
  );

  const loadEventsForSession = useCallback(
    async (channelId: string, workspaceId: string, sessionId: string) => {
      const store = useThreadStore.getState();
      store.resetSessionViewState();

      const { data: eventsData } = await executeSessionEvents({
        variables: {
          channelId,
          workspaceId,
          sessionId,
          limit: SESSION_PAGE_SIZE,
        },
        fetchPolicy: "network-only",
      });

      // Bail if workspace changed during the network request
      if (useThreadStore.getState().selectedWorkspaceId !== workspaceId) return;

      applyEventsResult(
        channelId,
        workspaceId,
        sessionId,
        eventsData?.sessionEvents,
      );
    },
    [executeSessionEvents, applyEventsResult],
  );

  const loadSessionEvents = useCallback(
    async (workspace: Workspace) => {
      try {
        const { data: sessionsData } = await executeSessions({
          variables: {
            channelId: workspace.channelId,
            workspaceId: workspace.id,
          },
          fetchPolicy: "network-only",
        });

        // Bail if workspace changed during the network request
        if (useThreadStore.getState().selectedWorkspaceId !== workspace.id)
          return;

        const sessionList = (sessionsData?.sessions ?? []) as SessionInfo[];

        // Snapshot previous session IDs before overwriting so we can detect
        // genuinely new sessions below.
        const prevSessionIds = new Set(
          useThreadStore.getState().sessions.map((s) => s.id),
        );

        useThreadStore.getState().setSessions(sessionList);

        if (sessionList.length === 0) {
          useThreadStore.getState().setActiveSessionId(null);
          useThreadStore.getState().setSessionEvents([]);
          useThreadStore.getState().setSessionStatus("empty");
          return;
        }

        // When the UI is deliberately in the "empty" state (e.g. waiting for a
        // newly-spawned agent to create its session), don't snap back to an old
        // session.  Only auto-select once a session appears that wasn't in the
        // previous list.
        const { activeSessionId: currentActiveId, sessionStatus } =
          useThreadStore.getState();
        if (
          currentActiveId === null &&
          sessionStatus === "empty" &&
          prevSessionIds.size > 0 &&
          sessionList.every((s) => prevSessionIds.has(s.id))
        ) {
          return;
        }

        const latestSession = sessionList[sessionList.length - 1];
        useThreadStore.getState().setActiveSessionId(latestSession.id);
        await loadEventsForSession(
          workspace.channelId,
          workspace.id,
          latestSession.id,
        );

        const currentEvents = useThreadStore.getState().sessionEvents;
        const latestEvent = currentEvents[currentEvents.length - 1];
        if (latestEvent) {
          const lastReportedId =
            lastReportedSessionEventIdByWorkspaceRef.current.get(workspace.id);
          if (lastReportedId !== latestEvent.id) {
            lastReportedSessionEventIdByWorkspaceRef.current.set(
              workspace.id,
              latestEvent.id,
            );
            void reportAgentActivity(
              workspace.id,
              latestEvent.hookEventName,
              latestEvent.cliSessionId,
            );
          }
        }
      } catch {
        useThreadStore.getState().setSessionStatus("error");
      }
    },
    [executeSessions, loadEventsForSession, reportAgentActivity],
  );

  const loadOlderEvents = useCallback(async (): Promise<number> => {
    const query = sessionQueryRef.current;
    if (loadingOlderRef.current || !query) return 0;
    loadingOlderRef.current = true;
    useThreadStore.getState().setLoadingOlderEvents(true);
    try {
      const currentLength = useThreadStore.getState().sessionEvents.length;
      const { data } = await executeSessionEvents({
        variables: {
          channelId: query.channelId,
          workspaceId: query.workspaceId,
          sessionId: query.sessionId,
          limit: SESSION_PAGE_SIZE,
          offset: currentLength,
        },
      });

      const result = data?.sessionEvents;
      const olderEvents: ServerEvent[] = (result?.events ??
        []) as ServerEvent[];
      const total = result?.total;
      if (total != null) useThreadStore.getState().setSessionTotal(total);
      if (olderEvents.length > 0) {
        useThreadStore.getState().prependSessionEvents(olderEvents);
      }
      return olderEvents.length;
    } finally {
      loadingOlderRef.current = false;
      useThreadStore.getState().setLoadingOlderEvents(false);
    }
  }, [executeSessionEvents]);

  const switchSession = useCallback(
    async (sessionId: string) => {
      const workspace = useThreadStore.getState().selectedWorkspace;
      if (!workspace) return;

      useThreadStore.getState().setActiveSessionId(sessionId);
      useThreadStore.getState().setSessionStatus("loading");

      try {
        await loadEventsForSession(
          workspace.channelId,
          workspace.id,
          sessionId,
        );
      } catch {
        useThreadStore.getState().setSessionStatus("error");
      }
    },
    [loadEventsForSession],
  );

  const clearSession = useCallback(async (): Promise<string | null> => {
    const workspace = useThreadStore.getState().selectedWorkspace;
    const channelId = getActiveChannelId();
    if (!workspace || !channelId) return null;

    try {
      const { data } = await executeCreateSession({
        variables: { channelId, workspaceId: workspace.id },
      });

      const newSession = data?.createSession as SessionInfo | undefined;
      if (!newSession) return null;

      const store = useThreadStore.getState();
      store.addSession(newSession);
      store.setActiveSessionId(newSession.id);
      store.setSessionEvents([]);
      store.setSessionTotal(0);
      store.setSessionStatus("empty");
      store.resetSessionViewState();
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
  }, [executeCreateSession, getActiveChannelId]);

  const checkWorktree = useCallback(
    async (workspaceId: string) => {
      if (
        !window.traceAPI ||
        typeof window.traceAPI.checkWorktreeExists !== "function"
      ) {
        useThreadStore.getState().setHasWorktree(false);
        useThreadStore.getState().setWorktreePath(null);
        return;
      }
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.checkWorktreeExists(
          workspaceId,
          repoPath,
        );
        const exists = result.success && result.exists === true;
        useThreadStore.getState().setHasWorktree(exists);
        useThreadStore
          .getState()
          .setWorktreePath(
            exists && result.worktreePath ? result.worktreePath : null,
          );
      } catch {
        useThreadStore.getState().setHasWorktree(false);
        useThreadStore.getState().setWorktreePath(null);
      }
    },
    [getChannelRepoPath],
  );

  const deleteWorktree = useCallback(
    async (onDeleted?: (workspaceId: string) => void) => {
      const workspace = useThreadStore.getState().selectedWorkspace;
      if (!workspace) return;

      const confirmed = window.confirm(
        "Delete this worktree? This removes local files for this workspace.",
      );
      if (!confirmed) return;

      useThreadStore.getState().setDeletingWorktree(true);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.deleteWorktree(
          workspace.id,
          repoPath,
          getChannelTeardownCommands?.(),
        );
        if (!result.success) {
          console.error("Failed to delete worktree:", result.error);
          return;
        }
        useThreadStore.getState().setHasWorktree(false);
        useThreadStore.getState().setWorktreePath(null);
        onDeleted?.(workspace.id);
      } finally {
        useThreadStore.getState().setDeletingWorktree(false);
      }
    },
    [getChannelRepoPath, getChannelTeardownCommands],
  );

  const mergeWorktree = useCallback(async () => {
    const workspace = useThreadStore.getState().selectedWorkspace;
    if (!workspace) return;

    const baseBranch = getChannelBaseBranch();
    const confirmed = window.confirm(
      `Merge this worktree branch into ${baseBranch}?`,
    );
    if (!confirmed) return;

    useThreadStore.getState().setMergingWorktree(true);
    try {
      const repoPath = getChannelRepoPath();
      const result = await window.traceAPI.mergeWorktree(
        workspace.id,
        repoPath,
        baseBranch,
      );
      if (!result.success) {
        console.error("Failed to merge worktree:", result.error);
      }
    } finally {
      useThreadStore.getState().setMergingWorktree(false);
    }
  }, [getChannelBaseBranch, getChannelRepoPath]);

  const openThreadPanel = useCallback(
    (workspace: Workspace) => {
      // Render pane shell immediately (synchronous)
      useThreadStore.getState().openThreadPanelUI(workspace);

      // Debounce expensive async work so rapid navigation skips intermediate workspaces
      if (asyncDebounceRef.current) clearTimeout(asyncDebounceRef.current);
      asyncDebounceRef.current = setTimeout(() => {
        // Staleness guard: skip if user already navigated away
        if (useThreadStore.getState().selectedWorkspaceId !== workspace.id)
          return;
        void loadSessionEvents(workspace);
        void checkWorktree(workspace.id);
      }, 150);
    },
    [loadSessionEvents, checkWorktree],
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (asyncDebounceRef.current) clearTimeout(asyncDebounceRef.current);
    };
  }, []);

  // Register all sync actions on the store so consumers can call them directly
  useEffect(() => {
    useThreadStore.getState().registerSyncActions({
      loadSessionEvents,
      loadOlderEvents,
      switchSession,
      clearSession,
      deleteWorktree,
      openThreadPanel,
      reportAgentActivity,
    });
    return () => useThreadStore.getState().clearSyncActions();
  }, [
    loadSessionEvents,
    loadOlderEvents,
    switchSession,
    clearSession,
    deleteWorktree,
    openThreadPanel,
    reportAgentActivity,
  ]);

  return {
    loadSessionEvents,
    loadOlderEvents,
    switchSession,
    clearSession,
    checkWorktree,
    deleteWorktree,
    mergeWorktree,
    openThreadPanel,
    reportAgentActivity,
  };
}
