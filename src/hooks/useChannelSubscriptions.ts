import { useEffect, useSyncExternalStore } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { MESSAGE_FIELDS, THREAD_EVENT_PAYLOAD_FIELDS } from '../graphql/fragments';
import { subscribeWsConnection, getWsConnectionSnapshot } from '../graphql/client';
import type { ChannelMessage, KanbanTicket, ServerEvent } from '../types';

const MESSAGE_UPSERTED_SUBSCRIPTION = gql`
  subscription MessageUpserted($channelId: ID!) {
    messageUpserted(channelId: $channelId) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;

const MESSAGE_DELETED_SUBSCRIPTION = gql`
  subscription MessageDeleted($channelId: ID!) {
    messageDeleted(channelId: $channelId) {
      channelId
      messageId
    }
  }
`;

const THREAD_EVENT_CREATED_SUBSCRIPTION = gql`
  subscription ThreadEventCreated($channelId: ID!) {
    threadEventCreated(channelId: $channelId) {
      ...ThreadEventPayloadFields
    }
  }
  ${THREAD_EVENT_PAYLOAD_FIELDS}
`;

const THREAD_EVENT_UPDATED_SUBSCRIPTION = gql`
  subscription ThreadEventUpdated($channelId: ID!) {
    threadEventUpdated(channelId: $channelId) {
      ...ThreadEventPayloadFields
    }
  }
  ${THREAD_EVENT_PAYLOAD_FIELDS}
`;

const TICKET_READY_TO_RUN_SUBSCRIPTION = gql`
  subscription TicketReadyToRun($channelId: ID!) {
    ticketReadyToRun(channelId: $channelId) {
      channelId
      messageId
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
        messageId
        columnId
        title
        description
        solutionApproach
        status
        metadata
        sortOrder
        createdAt
        updatedAt
        message {
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
  upsertMessage: (message: ChannelMessage) => void;
  removeMessage: (messageId: string) => void;
  appendThreadEvent: (event: ServerEvent) => void;
  updateThreadEvent: (event: ServerEvent) => void;
  reportClaudeActivity: (messageId: string, eventType: string) => Promise<void>;
  selectedMessageIdRef: React.RefObject<string | null>;
  activeThreadIdRef: React.RefObject<string | null>;
  messagesRef: React.RefObject<ChannelMessage[]>;
  onNeedsAttention: (messageId: string, reason: 'stopped' | 'ask-user-question' | 'completed' | 'merged' | 'needs_input') => void;
  upsertTicket?: (ticket: KanbanTicket) => void;
  onTicketReadyToRun?: (messageId: string, runConfig: unknown) => void;
}

export function useChannelSubscriptions({
  activeChannelId,
  upsertMessage,
  removeMessage,
  appendThreadEvent,
  updateThreadEvent,
  reportClaudeActivity,
  selectedMessageIdRef,
  activeThreadIdRef,
  messagesRef,
  onNeedsAttention,
  upsertTicket,
  onTicketReadyToRun,
}: UseChannelSubscriptionsOptions) {
  const subscriptionsActive = useSyncExternalStore(subscribeWsConnection, getWsConnectionSnapshot);

  const skip = !activeChannelId;
  const variables = { channelId: activeChannelId ?? '' };

  // --- Message upserted ---
  const { data: messageData } = useSubscription(MESSAGE_UPSERTED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!messageData?.messageUpserted || !activeChannelId) return;
    const message = messageData.messageUpserted as ChannelMessage;

    // Detect completion/needs_input/merged transitions for attention notification
    if (message.status === 'completed' || message.status === 'merged' || message.status === 'needs_input') {
      const prev = messagesRef.current.find((m) => m.id === message.id);
      if (prev && prev.status !== message.status) {
        const notViewing = selectedMessageIdRef.current !== message.id || document.hidden;
        if (notViewing) {
          onNeedsAttention(message.id, message.status as 'completed' | 'merged' | 'needs_input');
        }
      }
    }

    upsertMessage(message);
  }, [messageData, activeChannelId, upsertMessage, messagesRef, selectedMessageIdRef, onNeedsAttention]);

  // --- Message deleted ---
  const { data: messageDeletedData } = useSubscription(MESSAGE_DELETED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!messageDeletedData?.messageDeleted || !activeChannelId) return;
    removeMessage(messageDeletedData.messageDeleted.messageId);
  }, [messageDeletedData, activeChannelId, removeMessage]);

  // --- Thread event created ---
  const { data: threadEventData } = useSubscription(THREAD_EVENT_CREATED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!threadEventData?.threadEventCreated || !activeChannelId) return;
    const payload = threadEventData.threadEventCreated;

    void reportClaudeActivity(payload.messageId, payload.event.hookEventName);

    if (payload.event.hookEventName === 'Stop') {
      const existing = messagesRef.current.find((item) => item.id === payload.messageId);
      if (existing && existing.session.status !== 'stopped') {
        upsertMessage({
          ...existing,
          session: { ...existing.session, status: 'stopped' },
        });
      }
      if (selectedMessageIdRef.current !== payload.messageId) {
        const reason = payload.event.toolName === 'AskUserQuestion' ? 'ask-user-question' : 'stopped';
        onNeedsAttention(payload.messageId, reason);
      }
    }

    if (payload.event.hookEventName === 'AskUserQuestion') {
      if (selectedMessageIdRef.current !== payload.messageId) {
        onNeedsAttention(payload.messageId, 'ask-user-question');
      }
    }

    if (selectedMessageIdRef.current !== payload.messageId) return;

    // Only append events belonging to the active thread
    const currentThreadId = activeThreadIdRef.current;
    if (currentThreadId && payload.event.threadId !== currentThreadId) return;

    appendThreadEvent(payload.event as ServerEvent);
  }, [threadEventData, activeChannelId, reportClaudeActivity, messagesRef, upsertMessage, selectedMessageIdRef, activeThreadIdRef, onNeedsAttention, appendThreadEvent]);

  // --- Thread event updated ---
  const { data: threadEventUpdatedData } = useSubscription(THREAD_EVENT_UPDATED_SUBSCRIPTION, {
    variables,
    skip,
  });

  useEffect(() => {
    if (!threadEventUpdatedData?.threadEventUpdated || !activeChannelId) return;
    const payload = threadEventUpdatedData.threadEventUpdated;

    // Trigger attention notification for enriched AskUserQuestion events (before filtering)
    if (payload.event.toolName === 'AskUserQuestion') {
      if (selectedMessageIdRef.current !== payload.messageId) {
        onNeedsAttention(payload.messageId, 'ask-user-question');
      }
    }

    if (selectedMessageIdRef.current !== payload.messageId) return;

    const currentThreadId = activeThreadIdRef.current;
    if (currentThreadId && payload.event.threadId !== currentThreadId) return;

    updateThreadEvent(payload.event as ServerEvent);
  }, [threadEventUpdatedData, activeChannelId, selectedMessageIdRef, activeThreadIdRef, updateThreadEvent, onNeedsAttention]);

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
    const { messageId, runConfig } = ticketReadyData.ticketReadyToRun;
    onTicketReadyToRun(messageId, runConfig);
  }, [ticketReadyData, activeChannelId, onTicketReadyToRun]);

  return { subscriptionsActive };
}
