import { useCallback, useEffect, useRef } from 'react';
import { gql } from '@apollo/client';
import type { Workspace, ServerEvent } from '../types';
import type { SessionInfo } from '../stores/threadStore';
import {
  useCreateSessionMutation,
  useSessionsLazyQuery,
  useSessionEventsLazyQuery,
} from './__generated__/useThreadSync.generated';
import { useThreadStore } from '../stores/threadStore';

const SESSION_PAGE_SIZE = 100;

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

export function useThreadSync(getActiveChannelId: () => string | null) {
  const [executeSessions] = useSessionsLazyQuery();
  const [executeSessionEvents] = useSessionEventsLazyQuery();
  const [executeCreateSession] = useCreateSessionMutation();

  const loadingOlderRef = useRef(false);
  const sessionQueryRef = useRef<{
    channelId: string;
    workspaceId: string;
    sessionId: string;
  } | null>(null);
  const asyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      store.setSessionStatus(events.length === 0 ? 'empty' : 'ready');
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
        fetchPolicy: 'network-only',
      });

      if (useThreadStore.getState().selectedWorkspaceId !== workspaceId) return;

      applyEventsResult(channelId, workspaceId, sessionId, eventsData?.sessionEvents);
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
          fetchPolicy: 'network-only',
        });

        if (useThreadStore.getState().selectedWorkspaceId !== workspace.id) return;

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
      } catch {
        useThreadStore.getState().setSessionStatus('error');
      }
    },
    [executeSessions, loadEventsForSession],
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
      sessionQueryRef.current = {
        channelId,
        workspaceId: workspace.id,
        sessionId: newSession.id,
      };
      return newSession.id;
    } catch (err) {
      console.error('Failed to clear session:', err);
      return null;
    }
  }, [executeCreateSession, getActiveChannelId]);

  const openThreadPanel = useCallback(
    (workspace: Workspace) => {
      useThreadStore.getState().openThreadPanelUI(workspace);

      if (asyncDebounceRef.current) clearTimeout(asyncDebounceRef.current);
      asyncDebounceRef.current = setTimeout(() => {
        if (useThreadStore.getState().selectedWorkspaceId !== workspace.id) return;
        void loadSessionEvents(workspace);
      }, 150);
    },
    [loadSessionEvents],
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (asyncDebounceRef.current) clearTimeout(asyncDebounceRef.current);
    };
  }, []);

  // Register sync actions on the store
  useEffect(() => {
    useThreadStore.getState().registerSyncActions({
      loadSessionEvents,
      loadOlderEvents,
      switchSession,
      clearSession,
      openThreadPanel,
      reportAgentActivity: async () => {},
    });
    return () => useThreadStore.getState().clearSyncActions();
  }, [loadSessionEvents, loadOlderEvents, switchSession, clearSession, openThreadPanel]);

  return {
    loadSessionEvents,
    loadOlderEvents,
    switchSession,
    clearSession,
    openThreadPanel,
  };
}
