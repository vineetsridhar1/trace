import { useEffect, useSyncExternalStore } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { WORKSPACE_FIELDS, SESSION_EVENT_PAYLOAD_FIELDS } from '../graphql/fragments';
import { subscribeWsConnection, getWsConnectionSnapshot } from '../graphql/client';
import type { Workspace, KanbanTicket, ServerEvent } from '../types';

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

const WORKSPACE_READY_FOR_REVIEW_SUBSCRIPTION = gql`
  subscription WorkspaceReadyForReview($channelId: ID!) {
    workspaceReadyForReview(channelId: $channelId) {
      channelId
      workspaceId
      claudeSessionId
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
  upsertWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (workspaceId: string) => void;
  appendSessionEvent: (event: ServerEvent) => void;
  updateSessionEvent: (event: ServerEvent) => void;
  reportClaudeActivity: (workspaceId: string, eventType: string, sessionId?: string) => Promise<void>;
  selectedWorkspaceIdRef: React.RefObject<string | null>;
  activeSessionIdRef: React.RefObject<string | null>;
  workspacesRef: React.RefObject<Workspace[]>;
  onNeedsAttention: (workspaceId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => void;
  upsertTicket?: (ticket: KanbanTicket) => void;
  onTicketReadyToRun?: (workspaceId: string, runConfig: unknown) => void;
  onWorkspaceReadyForReview?: (workspaceId: string, claudeSessionId: string | null) => void;
  onWorkspaceCompleted?: () => void;
  refreshWorkspaces?: (channelId: string) => Promise<void>;
}

export function useChannelSubscriptions({
  activeChannelId,
  upsertWorkspace,
  removeWorkspace,
  appendSessionEvent,
  updateSessionEvent,
  reportClaudeActivity,
  selectedWorkspaceIdRef,
  activeSessionIdRef,
  workspacesRef,
  onNeedsAttention,
  upsertTicket,
  onTicketReadyToRun,
  onWorkspaceReadyForReview,
  onWorkspaceCompleted,
  refreshWorkspaces,
}: UseChannelSubscriptionsOptions) {
  const subscriptionsActive = useSyncExternalStore(subscribeWsConnection, getWsConnectionSnapshot);

  const skip = !activeChannelId;
  const variables = { channelId: activeChannelId ?? '' };

  // --- Workspace upserted ---
  const { data: workspaceData } = useSubscription(WORKSPACE_UPSERTED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!workspaceData?.workspaceUpserted || !activeChannelId) return;
    const workspace = workspaceData.workspaceUpserted as Workspace;

    // Detect completion/needs_input/merged transitions for attention notification
    let transitionedToCompleted = false;
    if (workspace.status === 'completed' || workspace.status === 'merged' || workspace.status === 'needs_input') {
      const prev = workspacesRef.current.find((m) => m.id === workspace.id);
      if (prev && prev.status !== workspace.status) {
        const notViewing = selectedWorkspaceIdRef.current !== workspace.id || document.hidden;
        if (notViewing) {
          onNeedsAttention(workspace.id, workspace.status as 'completed' | 'merged' | 'needs_input');
        }
        if (workspace.status === 'completed' && workspace.branch) {
          transitionedToCompleted = true;
        }
      }
    }

    upsertWorkspace(workspace);

    // Trigger merge check after React flushes the upsertWorkspace state update
    // so workspacesRef reflects the new "completed" status when checkMerged reads it
    if (transitionedToCompleted && onWorkspaceCompleted) {
      setTimeout(onWorkspaceCompleted, 0);
    }
  }, [workspaceData, activeChannelId, upsertWorkspace, workspacesRef, selectedWorkspaceIdRef, onNeedsAttention, onWorkspaceCompleted]);

  // --- Workspace deleted ---
  const { data: workspaceDeletedData } = useSubscription(WORKSPACE_DELETED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!workspaceDeletedData?.workspaceDeleted || !activeChannelId) return;
    removeWorkspace(workspaceDeletedData.workspaceDeleted.workspaceId);
  }, [workspaceDeletedData, activeChannelId, removeWorkspace]);

  // --- Session event created ---
  const { data: sessionEventData } = useSubscription(SESSION_EVENT_CREATED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!sessionEventData?.sessionEventCreated || !activeChannelId) return;
    const payload = sessionEventData.sessionEventCreated;

    void reportClaudeActivity(payload.workspaceId, payload.event.hookEventName, payload.event.cliSessionId);

    if (payload.event.hookEventName === 'Stop') {
      const existing = workspacesRef.current.find((item) => item.id === payload.workspaceId);
      if (existing && existing.cliSession.status !== 'stopped') {
        upsertWorkspace({
          ...existing,
          cliSession: { ...existing.cliSession, status: 'stopped' },
        });
      }
      if (selectedWorkspaceIdRef.current !== payload.workspaceId) {
        const reason = payload.event.toolName === 'AskUserQuestion' ? 'ask-user-question' : 'stopped';
        onNeedsAttention(payload.workspaceId, reason);
      }
      // Re-fetch messages after the server's inline auto-complete runs.
      // The Stop event triggers status transitions (completed/auto_review)
      // on the server synchronously, so by the time this subscription fires
      // the DB already has the final status. A short delay accounts for the
      // close handler's enrichment merge and any network latency.
      if (refreshMessages && activeChannelId) {
        setTimeout(() => void refreshMessages(activeChannelId), 500);
      }
    }

    if (payload.event.hookEventName === 'AskUserQuestion') {
      if (selectedWorkspaceIdRef.current !== payload.workspaceId) {
        onNeedsAttention(payload.workspaceId, 'ask-user-question');
      }
    }

    if (selectedWorkspaceIdRef.current !== payload.workspaceId) return;

    // Only append events belonging to the active session
    const currentSessionId = activeSessionIdRef.current;
    if (currentSessionId && payload.event.sessionId !== currentSessionId) return;

    appendSessionEvent(payload.event as ServerEvent);
  }, [sessionEventData, activeChannelId, reportClaudeActivity, workspacesRef, upsertWorkspace, selectedWorkspaceIdRef, activeSessionIdRef, onNeedsAttention, appendSessionEvent, refreshWorkspaces]);

  // --- Session event updated ---
  const { data: sessionEventUpdatedData } = useSubscription(SESSION_EVENT_UPDATED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!sessionEventUpdatedData?.sessionEventUpdated || !activeChannelId) return;
    const payload = sessionEventUpdatedData.sessionEventUpdated;

    // Trigger attention notification for enriched AskUserQuestion events (before filtering)
    if (payload.event.toolName === 'AskUserQuestion') {
      if (selectedWorkspaceIdRef.current !== payload.workspaceId) {
        onNeedsAttention(payload.workspaceId, 'ask-user-question');
      }
    }

    if (selectedWorkspaceIdRef.current !== payload.workspaceId) return;

    const currentSessionId = activeSessionIdRef.current;
    if (currentSessionId && payload.event.sessionId !== currentSessionId) return;

    updateSessionEvent(payload.event as ServerEvent);
  }, [sessionEventUpdatedData, activeChannelId, selectedWorkspaceIdRef, activeSessionIdRef, updateSessionEvent, onNeedsAttention]);

  // --- Ticket upserted ---
  const { data: ticketData } = useSubscription(TICKET_UPSERTED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!ticketData?.ticketUpserted || !activeChannelId || !upsertTicket) return;
    const payload = ticketData.ticketUpserted;
    upsertTicket({ ...payload.ticket, columnSlug: payload.columnSlug } as KanbanTicket);
  }, [ticketData, activeChannelId, upsertTicket]);

  // --- Ticket ready to run ---
  const { data: ticketReadyData } = useSubscription(TICKET_READY_TO_RUN_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!ticketReadyData?.ticketReadyToRun || !activeChannelId || !onTicketReadyToRun) return;
    const { workspaceId, runConfig } = ticketReadyData.ticketReadyToRun;
    onTicketReadyToRun(workspaceId, runConfig);
  }, [ticketReadyData, activeChannelId, onTicketReadyToRun]);

  // --- Workspace ready for review ---
  const { data: reviewReadyData } = useSubscription(WORKSPACE_READY_FOR_REVIEW_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!reviewReadyData?.workspaceReadyForReview || !activeChannelId || !onWorkspaceReadyForReview) return;
    const { workspaceId, claudeSessionId } = reviewReadyData.workspaceReadyForReview;
    onWorkspaceReadyForReview(workspaceId, claudeSessionId);
  }, [reviewReadyData, activeChannelId, onWorkspaceReadyForReview]);

  return { subscriptionsActive };
}
