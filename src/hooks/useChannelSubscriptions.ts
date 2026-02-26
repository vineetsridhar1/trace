import { useEffect, useState } from 'react';
import { gql, useSubscription } from '@apollo/client';
import { MESSAGE_FIELDS } from '../graphql/fragments';
import { onWsConnectionChange } from '../graphql/client';
import type { ChannelMessage, KanbanTicket, ServerEvent } from '../types';

const MESSAGE_UPSERTED_SUBSCRIPTION = gql`
  subscription MessageUpserted($channelId: ID!) {
    messageUpserted(channelId: $channelId) {
      ...MessageFields
    }
  }
  ${MESSAGE_FIELDS}
`;

const THREAD_EVENT_CREATED_SUBSCRIPTION = gql`
  subscription ThreadEventCreated($channelId: ID!) {
    threadEventCreated(channelId: $channelId) {
      channelId
      messageId
      threadId
      event {
        id
        sessionId
        hookEventName
        timestamp
        toolName
        toolInput
        toolResponse
        toolUseId
        stopHookActive
        lastAssistantMessage
        rawPayload
        threadId
        importance
      }
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
  appendThreadEvent: (event: ServerEvent) => void;
  reportClaudeActivity: (messageId: string, eventType: string) => Promise<void>;
  selectedMessageIdRef: React.RefObject<string | null>;
  activeThreadIdRef: React.RefObject<string | null>;
  messagesRef: React.RefObject<ChannelMessage[]>;
  onNeedsAttention: (messageId: string, reason: 'stopped' | 'ask-user-question' | 'completed') => void;
  upsertTicket?: (ticket: KanbanTicket) => void;
}

export function useChannelSubscriptions({
  activeChannelId,
  upsertMessage,
  appendThreadEvent,
  reportClaudeActivity,
  selectedMessageIdRef,
  activeThreadIdRef,
  messagesRef,
  onNeedsAttention,
  upsertTicket,
}: UseChannelSubscriptionsOptions) {
  const [subscriptionsActive, setSubscriptionsActive] = useState(false);

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

    // Detect completion transitions for attention notification
    if (message.status === 'completed') {
      const prev = messagesRef.current.find((m) => m.id === message.id);
      if (prev && prev.status !== 'completed') {
        const notViewing = selectedMessageIdRef.current !== message.id || document.hidden;
        if (notViewing) {
          onNeedsAttention(message.id, 'completed');
        }
      }
    }

    upsertMessage(message);
  }, [messageData, activeChannelId, upsertMessage, messagesRef, selectedMessageIdRef, onNeedsAttention]);

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

  // Track actual WebSocket connection state
  useEffect(() => {
    return onWsConnectionChange(setSubscriptionsActive);
  }, []);

  return { subscriptionsActive };
}
