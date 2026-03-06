import { useEffect, useRef, useSyncExternalStore } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { WORKSPACE_FIELDS, SESSION_EVENT_PAYLOAD_FIELDS } from '../graphql/fragments';
import { subscribeWsConnection, getWsConnectionSnapshot } from '../graphql/client';
import type { Workspace, ServerEvent } from '../types';
import { normalizeToolName } from '../utils';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useThreadStore } from '../stores/threadStore';
import { useAgentRunStore } from '../stores/agentRunStore';

const WORKSPACE_UPSERTED_SUBSCRIPTION = gql`
  subscription WorkspaceUpserted($channelId: ID!) {
    workspaceUpserted(channelId: $channelId) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

const WORKSPACE_DELETED_SUBSCRIPTION = gql`
  subscription WorkspaceDeleted($channelId: ID!) {
    workspaceDeleted(channelId: $channelId) {
      channelId
      workspaceId
    }
  }
`;

const SESSION_EVENT_CREATED_SUBSCRIPTION = gql`
  subscription SessionEventCreated($channelId: ID!) {
    sessionEventCreated(channelId: $channelId) {
      ...SessionEventPayloadFields
    }
  }
  ${SESSION_EVENT_PAYLOAD_FIELDS}
`;

const SESSION_EVENT_UPDATED_SUBSCRIPTION = gql`
  subscription SessionEventUpdated($channelId: ID!) {
    sessionEventUpdated(channelId: $channelId) {
      ...SessionEventPayloadFields
    }
  }
  ${SESSION_EVENT_PAYLOAD_FIELDS}
`;

interface UseChannelSubscriptionsOptions {
  activeChannelId: string | null;
  onNeedsAttention: (workspaceId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => void;
  onWorkspaceCompleted?: () => void;
  refreshWorkspaces?: (channelId: string) => Promise<void>;
}

export function useChannelSubscriptions({
  activeChannelId,
  onNeedsAttention,
  onWorkspaceCompleted,
  refreshWorkspaces,
}: UseChannelSubscriptionsOptions) {
  const subscriptionsActive = useSyncExternalStore(subscribeWsConnection, getWsConnectionSnapshot);

  const skip = !activeChannelId;
  const variables = { channelId: activeChannelId ?? '' };

  const reloadingSessionRef = useRef<string | null>(null);
  const channelIdRef = useRef(activeChannelId);
  channelIdRef.current = activeChannelId;

  const triggerSessionReload = (workspaceId: string) => {
    if (reloadingSessionRef.current === workspaceId) return;

    const threadState = useThreadStore.getState();
    const { sessions, activeSessionId } = threadState;

    const latestSession = sessions[sessions.length - 1];
    if (latestSession && activeSessionId !== latestSession.id) return;

    const workspace = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId);
    if (!workspace) return;

    reloadingSessionRef.current = workspaceId;
    useThreadStore.getState().syncActions.loadSessionEvents(workspace).finally(() => {
      reloadingSessionRef.current = null;
    });
  };

  // --- Workspace upserted ---
  const { data: workspaceData } = useSubscription(WORKSPACE_UPSERTED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!workspaceData?.workspaceUpserted || !activeChannelId) return;
    const workspace = workspaceData.workspaceUpserted as Workspace;
    if (workspace.channelId !== channelIdRef.current) return;

    let transitionedToCompleted = false;
    if (workspace.status === 'completed' || workspace.status === 'merged' || workspace.status === 'needs_input') {
      const prev = useWorkspaceStore.getState().workspaces.find((m) => m.id === workspace.id);
      if (prev && prev.status !== workspace.status) {
        const notViewing = useThreadStore.getState().selectedWorkspaceId !== workspace.id || document.hidden;
        if (notViewing) {
          onNeedsAttention(workspace.id, workspace.status as 'completed' | 'merged' | 'needs_input');
        }
        if (workspace.status === 'completed' && workspace.branch) {
          transitionedToCompleted = true;
        }
      }
    }

    const storeState = useWorkspaceStore.getState();
    const alreadyInStore = storeState.workspaces.some((w) => w.id === workspace.id);
    if (workspace.status === 'merged' && !alreadyInStore && !storeState.mergedWorkspacesLoaded) {
      return;
    }

    storeState.upsertWorkspace(workspace);
    useThreadStore.getState().syncSelectedWorkspace(workspace);

    const pendingId = useAgentRunStore.getState().pendingRunWorkspaceId;
    if (pendingId === workspace.id && workspace.status !== 'pending') {
      useAgentRunStore.getState().clearPendingRun();
    }

    if (transitionedToCompleted && onWorkspaceCompleted) {
      setTimeout(onWorkspaceCompleted, 0);
    }
  }, [workspaceData, activeChannelId, onNeedsAttention, onWorkspaceCompleted]);

  // --- Workspace deleted ---
  const { data: workspaceDeletedData } = useSubscription(WORKSPACE_DELETED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!workspaceDeletedData?.workspaceDeleted || !activeChannelId) return;
    if (workspaceDeletedData.workspaceDeleted.channelId !== channelIdRef.current) return;
    const deletedWorkspaceId = workspaceDeletedData.workspaceDeleted.workspaceId;
    useWorkspaceStore.getState().removeWorkspace(deletedWorkspaceId);
    const pendingId = useAgentRunStore.getState().pendingRunWorkspaceId;
    if (pendingId === deletedWorkspaceId) {
      useAgentRunStore.getState().clearPendingRun();
    }
  }, [workspaceDeletedData, activeChannelId]);

  // --- Session event created ---
  const { data: sessionEventData } = useSubscription(SESSION_EVENT_CREATED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!sessionEventData?.sessionEventCreated || !activeChannelId) return;
    const payload = sessionEventData.sessionEventCreated;
    if (payload.channelId !== channelIdRef.current) return;

    if (payload.event.hookEventName === 'Stop') {
      useAgentRunStore.getState().clearActiveRun(payload.workspaceId);
      const existing = useWorkspaceStore.getState().workspaces.find((item) => item.id === payload.workspaceId);
      if (existing && existing.cliSession.status !== 'stopped') {
        useWorkspaceStore.getState().upsertWorkspace({
          ...existing,
          cliSession: { ...existing.cliSession, status: 'stopped' },
        });
        useThreadStore.getState().syncSelectedWorkspace({
          ...existing,
          cliSession: { ...existing.cliSession, status: 'stopped' },
        });
      }
      const selectedWorkspaceId = useThreadStore.getState().selectedWorkspaceId;
      if (selectedWorkspaceId !== payload.workspaceId) {
        const reason = payload.event.toolName === 'AskUserQuestion' ? 'ask-user-question' : 'stopped';
        onNeedsAttention(payload.workspaceId, reason);
      }
      if (refreshWorkspaces && activeChannelId) {
        setTimeout(() => void refreshWorkspaces(activeChannelId), 500);
      }
    } else {
      const existing = useWorkspaceStore.getState().workspaces.find((item) => item.id === payload.workspaceId);
      if (existing && existing.cliSession.status === 'stopped') {
        useWorkspaceStore.getState().upsertWorkspace({
          ...existing,
          cliSession: { ...existing.cliSession, status: 'active' },
        });
        useThreadStore.getState().syncSelectedWorkspace({
          ...existing,
          cliSession: { ...existing.cliSession, status: 'active' },
        });
      }
    }

    if (payload.event.hookEventName === 'AskUserQuestion') {
      const selectedWorkspaceId = useThreadStore.getState().selectedWorkspaceId;
      if (selectedWorkspaceId !== payload.workspaceId) {
        onNeedsAttention(payload.workspaceId, 'ask-user-question');
      }
    }

    // Cache TodoWrite events for sidebar popover
    if (
      payload.event.hookEventName === 'PostToolUse' &&
      normalizeToolName(payload.event.toolName) === 'todowrite'
    ) {
      const input = payload.event.toolInput as Record<string, unknown> | null;
      const todos = input?.todos as Array<{ content: string; status: string; activeForm?: string }> | undefined;
      if (Array.isArray(todos) && todos.length > 0) {
        useWorkspaceStore.getState().setLatestTodos(payload.workspaceId, todos);
      }
    }

    const threadState = useThreadStore.getState();
    if (threadState.selectedWorkspaceId !== payload.workspaceId) return;

    const currentSessionId = threadState.activeSessionId;
    if (currentSessionId && payload.event.sessionId !== currentSessionId) {
      const isKnownSession = threadState.sessions.some((s) => s.id === payload.event.sessionId);
      if (!isKnownSession) {
        triggerSessionReload(payload.workspaceId);
      }
      return;
    }

    useThreadStore.getState().appendSessionEvent(payload.event as ServerEvent);
  }, [sessionEventData, activeChannelId, onNeedsAttention, refreshWorkspaces]);

  // --- Session event updated ---
  const { data: sessionEventUpdatedData } = useSubscription(SESSION_EVENT_UPDATED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!sessionEventUpdatedData?.sessionEventUpdated || !activeChannelId) return;
    const payload = sessionEventUpdatedData.sessionEventUpdated;
    if (payload.channelId !== channelIdRef.current) return;

    if (payload.event.toolName === 'AskUserQuestion') {
      const selectedWorkspaceId = useThreadStore.getState().selectedWorkspaceId;
      if (selectedWorkspaceId !== payload.workspaceId) {
        onNeedsAttention(payload.workspaceId, 'ask-user-question');
      }
    }

    const threadState = useThreadStore.getState();
    if (threadState.selectedWorkspaceId !== payload.workspaceId) return;

    const currentSessionId = threadState.activeSessionId;
    if (currentSessionId && payload.event.sessionId !== currentSessionId) {
      const isKnownSession = threadState.sessions.some((s) => s.id === payload.event.sessionId);
      if (!isKnownSession) {
        triggerSessionReload(payload.workspaceId);
      }
      return;
    }

    useThreadStore.getState().updateSessionEvent(payload.event as ServerEvent);
  }, [sessionEventUpdatedData, activeChannelId, onNeedsAttention]);

  return { subscriptionsActive };
}
