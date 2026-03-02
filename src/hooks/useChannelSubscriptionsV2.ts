import { useEffect, useSyncExternalStore } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { WORKSPACE_FIELDS, SESSION_EVENT_PAYLOAD_FIELDS } from '../graphql/fragments';
import { subscribeWsConnection, getWsConnectionSnapshot } from '../graphql/client';
import type { Workspace, KanbanTicket, ServerEvent } from '../types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useThreadStore } from '../stores/threadStore';
import { useKanbanStore } from '../stores/kanbanStore';
import { useClaudeRunStore } from '../stores/claudeRunStore';

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

const TICKET_READY_TO_RUN_SUBSCRIPTION = gql`
  subscription TicketReadyToRun($channelId: ID!) {
    ticketReadyToRun(channelId: $channelId) {
      channelId
      workspaceId
      runConfig
    }
  }
`;

const TICKET_UPSERTED_SUBSCRIPTION = gql`
  subscription TicketUpserted($channelId: ID!) {
    ticketUpserted(channelId: $channelId) {
      channelId
      columnSlug
      ticket {
        id
        workspaceId
        columnId
        title
        description
        solutionApproach
        status
        metadata
        sortOrder
        createdAt
        updatedAt
        workspace {
          id
          branch
          status
          createdAt
          attachments {
            id
            key
            filename
            contentType
            url
          }
        }
      }
    }
  }
`;

interface UseChannelSubscriptionsOptions {
  activeChannelId: string | null;
  reportClaudeActivity: (workspaceId: string, eventType: string, sessionId?: string) => Promise<void>;
  onNeedsAttention: (workspaceId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => void;
  onTicketReadyToRun?: (workspaceId: string, runConfig: unknown) => void;
  onWorkspaceCompleted?: () => void;
  refreshWorkspaces?: (channelId: string) => Promise<void>;
}

export function useChannelSubscriptions({
  activeChannelId,
  reportClaudeActivity,
  onNeedsAttention,
  onTicketReadyToRun,
  onWorkspaceCompleted,
  refreshWorkspaces,
}: UseChannelSubscriptionsOptions) {
  const subscriptionsActive = useSyncExternalStore(subscribeWsConnection, getWsConnectionSnapshot);

  const skip = !activeChannelId;
  const variables = { channelId: activeChannelId ?? '' };

  // --- Workspace upserted ---
  const { data: workspaceData } = useSubscription(WORKSPACE_UPSERTED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!workspaceData?.workspaceUpserted || !activeChannelId) return;
    const workspace = workspaceData.workspaceUpserted as Workspace;

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

    useWorkspaceStore.getState().upsertWorkspace(workspace);
    useThreadStore.getState().syncSelectedWorkspace(workspace);

    const pendingId = useClaudeRunStore.getState().pendingRunWorkspaceId;
    if (pendingId === workspace.id && workspace.status !== 'pending') {
      useClaudeRunStore.getState().clearPendingRun();
    }

    if (transitionedToCompleted && onWorkspaceCompleted) {
      setTimeout(onWorkspaceCompleted, 0);
    }
  }, [workspaceData, activeChannelId, onNeedsAttention, onWorkspaceCompleted]);

  // --- Workspace deleted ---
  const { data: workspaceDeletedData } = useSubscription(WORKSPACE_DELETED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!workspaceDeletedData?.workspaceDeleted || !activeChannelId) return;
    useWorkspaceStore.getState().removeWorkspace(workspaceDeletedData.workspaceDeleted.workspaceId);
    const pendingId = useClaudeRunStore.getState().pendingRunWorkspaceId;
    if (pendingId === workspaceDeletedData.workspaceDeleted.workspaceId) {
      useClaudeRunStore.getState().clearPendingRun();
    }
  }, [workspaceDeletedData, activeChannelId]);

  // --- Session event created ---
  const { data: sessionEventData } = useSubscription(SESSION_EVENT_CREATED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!sessionEventData?.sessionEventCreated || !activeChannelId) return;
    const payload = sessionEventData.sessionEventCreated;

    void reportClaudeActivity(payload.workspaceId, payload.event.hookEventName, payload.event.cliSessionId);

    if (payload.event.hookEventName === 'Stop') {
      useClaudeRunStore.getState().clearActiveRun(payload.workspaceId);
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

    const threadState = useThreadStore.getState();
    if (threadState.selectedWorkspaceId !== payload.workspaceId) return;

    const currentSessionId = threadState.activeSessionId;
    if (currentSessionId && payload.event.sessionId !== currentSessionId) return;

    useThreadStore.getState().appendSessionEvent(payload.event as ServerEvent);
  }, [sessionEventData, activeChannelId, reportClaudeActivity, onNeedsAttention, refreshWorkspaces]);

  // --- Session event updated ---
  const { data: sessionEventUpdatedData } = useSubscription(SESSION_EVENT_UPDATED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!sessionEventUpdatedData?.sessionEventUpdated || !activeChannelId) return;
    const payload = sessionEventUpdatedData.sessionEventUpdated;

    if (payload.event.toolName === 'AskUserQuestion') {
      const selectedWorkspaceId = useThreadStore.getState().selectedWorkspaceId;
      if (selectedWorkspaceId !== payload.workspaceId) {
        onNeedsAttention(payload.workspaceId, 'ask-user-question');
      }
    }

    const threadState = useThreadStore.getState();
    if (threadState.selectedWorkspaceId !== payload.workspaceId) return;

    const currentSessionId = threadState.activeSessionId;
    if (currentSessionId && payload.event.sessionId !== currentSessionId) return;

    useThreadStore.getState().updateSessionEvent(payload.event as ServerEvent);
  }, [sessionEventUpdatedData, activeChannelId, onNeedsAttention]);

  // --- Ticket upserted ---
  const { data: ticketData } = useSubscription(TICKET_UPSERTED_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!ticketData?.ticketUpserted || !activeChannelId) return;
    const payload = ticketData.ticketUpserted;
    useKanbanStore.getState().upsertTicket({ ...payload.ticket, columnSlug: payload.columnSlug } as KanbanTicket);
  }, [ticketData, activeChannelId]);

  // --- Ticket ready to run ---
  const { data: ticketReadyData } = useSubscription(TICKET_READY_TO_RUN_SUBSCRIPTION, { variables, skip });

  useEffect(() => {
    if (!ticketReadyData?.ticketReadyToRun || !activeChannelId || !onTicketReadyToRun) return;
    const { workspaceId, runConfig } = ticketReadyData.ticketReadyToRun;
    onTicketReadyToRun(workspaceId, runConfig);
  }, [ticketReadyData, activeChannelId, onTicketReadyToRun]);

  return { subscriptionsActive };
}
