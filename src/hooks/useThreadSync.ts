import { useCallback, useEffect, useRef } from 'react';
import type { Workspace, ServerEvent } from '../types';
import type { SessionInfo } from './useThread';
import {
  useCreateSessionMutation,
  useSessionsLazyQuery,
  useSessionEventsLazyQuery,
} from './__generated__/useThread.generated';
import { useThreadStore } from '../stores/threadStore';

const SESSION_PAGE_SIZE = 100;

export function useThreadSync(
  getActiveChannelId: () => string | null,
  getChannelRepoPath: () => string,
  getChannelBaseBranch: () => string,
) {
  const [executeSessions] = useSessionsLazyQuery();
  const [executeSessionEvents] = useSessionEventsLazyQuery();
  const [executeCreateSession] = useCreateSessionMutation();

  const lastReportedSessionEventIdByWorkspaceRef = useRef<Map<string, string>>(new Map());
  const loadingOlderRef = useRef(false);
  const sessionQueryRef = useRef<{ channelId: string; workspaceId: string; sessionId: string } | null>(null);

  const reportClaudeActivity = useCallback(
    async (workspaceId: string, eventType: string, sessionId?: string) => {
      if (!window.traceAPI || typeof window.traceAPI.reportClaudeActivity !== 'function') return;
      try {
        await window.traceAPI.reportClaudeActivity(workspaceId, eventType, sessionId);
      } catch {
        // best-effort
      }
    },
    [],
  );

  const loadEventsForSession = useCallback(
    async (channelId: string, workspaceId: string, sessionId: string) => {
      const store = useThreadStore.getState();
      store.resetSessionViewState();

      const { data: eventsData } = await executeSessionEvents({
        variables: { channelId, workspaceId, sessionId, limit: SESSION_PAGE_SIZE },
      });

      const result = eventsData?.sessionEvents;
      const events: ServerEvent[] = (result?.events ?? []) as ServerEvent[];
      const total = result?.total ?? events.length;
      const threadState = useThreadStore.getState();
      threadState.setSessionEvents(events);
      threadState.setSessionTotal(total);
      if (result?.tokenUsage) {
        threadState.setTokenUsage({
          inputTokens: result.tokenUsage.inputTokens,
          outputTokens: result.tokenUsage.outputTokens,
          totalTokens: result.tokenUsage.totalTokens,
          cliCostUsd: result.cliCostUsd ?? undefined,
        });
      }
      sessionQueryRef.current = { channelId, workspaceId, sessionId };
      threadState.setSessionStatus(events.length === 0 ? 'empty' : 'ready');
    },
    [executeSessionEvents],
  );

  const loadSessionEvents = useCallback(
    async (workspace: Workspace) => {
      try {
        const store = useThreadStore.getState();
        if (store.sessionStatus === 'idle' || store.sessionStatus === 'error') {
          useThreadStore.getState().setSessionStatus('loading');
        }

        const { data: sessionsData } = await executeSessions({
          variables: { channelId: workspace.channelId, workspaceId: workspace.id },
        });

        const sessionList = (sessionsData?.sessions ?? []) as SessionInfo[];
        useThreadStore.getState().setSessions(sessionList);

        if (sessionList.length === 0) {
          useThreadStore.getState().setActiveSessionId(null);
          useThreadStore.getState().setSessionEvents([]);
          useThreadStore.getState().setSessionStatus('empty');
          return;
        }

        const latestSession = sessionList[sessionList.length - 1];
        useThreadStore.getState().setActiveSessionId(latestSession.id);
        await loadEventsForSession(workspace.channelId, workspace.id, latestSession.id);

        const currentEvents = useThreadStore.getState().sessionEvents;
        const latestEvent = currentEvents[currentEvents.length - 1];
        if (latestEvent) {
          const lastReportedId = lastReportedSessionEventIdByWorkspaceRef.current.get(workspace.id);
          if (lastReportedId !== latestEvent.id) {
            lastReportedSessionEventIdByWorkspaceRef.current.set(workspace.id, latestEvent.id);
            void reportClaudeActivity(workspace.id, latestEvent.hookEventName, latestEvent.cliSessionId);
          }
        }
      } catch {
        useThreadStore.getState().setSessionStatus('error');
      }
    },
    [executeSessions, loadEventsForSession, reportClaudeActivity],
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
      const olderEvents: ServerEvent[] = (result?.events ?? []) as ServerEvent[];
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
      useThreadStore.getState().setSessionStatus('loading');

      try {
        await loadEventsForSession(workspace.channelId, workspace.id, sessionId);
      } catch {
        useThreadStore.getState().setSessionStatus('error');
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
      store.setSessionStatus('empty');
      store.resetSessionViewState();
      sessionQueryRef.current = { channelId, workspaceId: workspace.id, sessionId: newSession.id };
      return newSession.id;
    } catch (err) {
      console.error('Failed to clear session:', err);
      return null;
    }
  }, [executeCreateSession, getActiveChannelId]);

  const checkWorktree = useCallback(
    async (workspaceId: string) => {
      if (!window.traceAPI || typeof window.traceAPI.checkWorktreeExists !== 'function') {
        useThreadStore.getState().setHasWorktree(false);
        return;
      }
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.checkWorktreeExists(workspaceId, repoPath);
        useThreadStore.getState().setHasWorktree(result.success && result.exists === true);
      } catch {
        useThreadStore.getState().setHasWorktree(false);
      }
    },
    [getChannelRepoPath],
  );

  const deleteWorktree = useCallback(
    async (onDeleted?: (workspaceId: string) => void) => {
      const workspace = useThreadStore.getState().selectedWorkspace;
      if (!workspace) return;

      const confirmed = window.confirm('Delete this worktree? This removes local files for this workspace.');
      if (!confirmed) return;

      useThreadStore.getState().setDeletingWorktree(true);
      try {
        const repoPath = getChannelRepoPath();
        const result = await window.traceAPI.deleteWorktree(workspace.id, repoPath);
        if (!result.success) {
          console.error('Failed to delete worktree:', result.error);
          return;
        }
        useThreadStore.getState().setHasWorktree(false);
        onDeleted?.(workspace.id);
      } finally {
        useThreadStore.getState().setDeletingWorktree(false);
      }
    },
    [getChannelRepoPath],
  );

  const mergeWorktree = useCallback(async () => {
    const workspace = useThreadStore.getState().selectedWorkspace;
    if (!workspace) return;

    const baseBranch = getChannelBaseBranch();
    const confirmed = window.confirm(`Merge this worktree branch into ${baseBranch}?`);
    if (!confirmed) return;

    useThreadStore.getState().setMergingWorktree(true);
    try {
      const repoPath = getChannelRepoPath();
      const result = await window.traceAPI.mergeWorktree(workspace.id, repoPath, baseBranch);
      if (!result.success) {
        console.error('Failed to merge worktree:', result.error);
      }
    } finally {
      useThreadStore.getState().setMergingWorktree(false);
    }
  }, [getChannelBaseBranch, getChannelRepoPath]);

  const openThreadPanel = useCallback(
    (workspace: Workspace) => {
      useThreadStore.getState().openThreadPanelUI(workspace);
      void loadSessionEvents(workspace);
      void checkWorktree(workspace.id);
    },
    [loadSessionEvents, checkWorktree],
  );

  // Register all sync actions on the store so consumers can call them directly
  useEffect(() => {
    useThreadStore.getState().registerSyncActions({
      loadSessionEvents,
      loadOlderEvents,
      switchSession,
      clearSession,
      deleteWorktree,
      openThreadPanel,
      reportClaudeActivity,
    });
    return () => useThreadStore.getState().clearSyncActions();
  }, [loadSessionEvents, loadOlderEvents, switchSession, clearSession, deleteWorktree, openThreadPanel, reportClaudeActivity]);

  return {
    loadSessionEvents,
    loadOlderEvents,
    switchSession,
    clearSession,
    checkWorktree,
    deleteWorktree,
    mergeWorktree,
    openThreadPanel,
    reportClaudeActivity,
  };
}
