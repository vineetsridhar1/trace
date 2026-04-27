import type { Actor, Event, Message } from "@trace/gql";
import { asJsonObject, isJsonObject } from "@trace/shared";
import { useEntityStore, eventScopeKey, messageScopeKey } from "@trace/client-core";
import { takePendingOptimisticChat } from "@trace/client-core";

type MessageScope =
  | { scopeType: "chat"; scopeId: string }
  | { scopeType: "channel"; scopeId: string };

function normalizeMentions(
  value: unknown,
  fallback: Message["mentions"] | null | undefined,
): Message["mentions"] | null {
  if (Array.isArray(value) || isJsonObject(value)) {
    return value as Message["mentions"];
  }

  return fallback ?? null;
}

function normalizeThreadRepliers(
  existing: Message["threadRepliers"] | null | undefined,
  actor: Actor,
) {
  const nextActor = {
    type: actor.type,
    id: actor.id,
    name: actor.name ?? null,
    avatarUrl: actor.avatarUrl ?? null,
  };

  return [
    nextActor,
    ...(existing ?? []).filter(
      (replier: { type: string; id: string }) =>
        `${replier.type}:${replier.id}` !== `${nextActor.type}:${nextActor.id}`,
    ),
  ].slice(0, 3);
}

function buildScopedMessage(
  scope: MessageScope,
  event: Event,
  payload: Record<string, unknown>,
  existing?: Message,
): Message {
  const parentMessageId =
    typeof payload.parentMessageId === "string" ? payload.parentMessageId : null;

  return {
    id: typeof payload.messageId === "string" ? payload.messageId : "",
    chatId: scope.scopeType === "chat" ? scope.scopeId : null,
    channelId: scope.scopeType === "channel" ? scope.scopeId : null,
    text: typeof payload.text === "string" ? payload.text : (existing?.text ?? ""),
    html: typeof payload.html === "string" ? payload.html : (existing?.html ?? null),
    mentions: normalizeMentions(payload.mentions, existing?.mentions),
    parentMessageId,
    replyCount: existing?.replyCount ?? 0,
    latestReplyAt: existing?.latestReplyAt ?? null,
    threadRepliers: existing?.threadRepliers ?? [],
    actor: event.actor,
    createdAt: existing?.createdAt ?? event.timestamp,
    updatedAt: event.timestamp,
    editedAt: existing?.editedAt ?? null,
    deletedAt: existing?.deletedAt ?? null,
  };
}

export function upsertScopedMessageFromEvent(event: Event, scope: MessageScope) {
  if (event.scopeType !== scope.scopeType || event.scopeId !== scope.scopeId) {
    return;
  }

  const payload = asJsonObject(event.payload);
  if (!payload) {
    return;
  }

  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  if (!messageId) {
    return;
  }

  const { messages, upsert, patch } = useEntityStore.getState();
  const existing = messages[messageId] as Message | undefined;

  if (event.eventType === "message_sent") {
    const nextMessage = buildScopedMessage(scope, event, payload, existing);

    // Chat optimistic reconciliation happens here because chats have both a
    // message entity and a scoped event to clean up.
    // Session optimistic reconciliation is handled in useOrgEvents + useSessionEvents
    // since sessions only have scoped events (no separate message entity).
    if (scope.scopeType === "chat") {
      const pending = takePendingOptimisticChat(scope.scopeId, event);
      if (pending) {
        // Atomic reconciliation: remove optimistic message, insert real message,
        // and clean up the optimistic scoped event in a single setState to avoid
        // intermediate renders that cause scroll glitches.
        const eventSK = eventScopeKey("chat", scope.scopeId);
        const msgSK = messageScopeKey("chat", scope.scopeId);
        useEntityStore.setState((state) => {
          // Remove optimistic message, add real message
          const { [pending.tempMessageId]: _removed, ...restMessages } = state.messages;
          const realMessage = buildScopedMessage(
            scope,
            event,
            payload,
            restMessages[messageId] as Message | undefined,
          );
          restMessages[messageId] = realMessage;

          // Update _messageIdsByScope: swap temp ID for real ID
          let nextMsgIndex = state._messageIdsByScope;
          const scopeIds = nextMsgIndex[msgSK];
          if (scopeIds) {
            const filtered = scopeIds.filter((id: string) => id !== pending.tempMessageId);
            if (!filtered.includes(messageId)) {
              filtered.push(messageId);
            }
            nextMsgIndex = { ...nextMsgIndex, [msgSK]: filtered };
          } else {
            nextMsgIndex = { ...nextMsgIndex, [msgSK]: [messageId] };
          }

          // Clean up optimistic scoped event
          let nextEventsByScope = state.eventsByScope;
          const bucket = nextEventsByScope[eventSK];
          if (bucket && bucket[pending.tempEventId]) {
            const { [pending.tempEventId]: _evt, ...restBucket } = bucket;
            nextEventsByScope = { ...nextEventsByScope, [eventSK]: restBucket };
          }

          return {
            messages: restMessages,
            _messageIdsByScope: nextMsgIndex,
            eventsByScope: nextEventsByScope,
          };
        });
      } else {
        upsert("messages", messageId, nextMessage);
      }
    } else {
      upsert("messages", messageId, nextMessage);
    }

    if (!existing && nextMessage.parentMessageId) {
      const root = messages[nextMessage.parentMessageId] as Message | undefined;
      if (root) {
        patch("messages", nextMessage.parentMessageId, {
          replyCount: (root.replyCount ?? 0) + 1,
          latestReplyAt: event.timestamp,
          threadRepliers: normalizeThreadRepliers(root.threadRepliers, event.actor),
        });
      }
    }
    return;
  }

  if (event.eventType === "message_edited") {
    if (existing) {
      patch("messages", messageId, {
        text: typeof payload.text === "string" ? payload.text : existing.text,
        html: typeof payload.html === "string" ? payload.html : existing.html,
        mentions: normalizeMentions(payload.mentions, existing.mentions),
        updatedAt: event.timestamp,
        editedAt: event.timestamp,
      });
    }
    return;
  }

  if (event.eventType === "message_deleted" && existing) {
    patch("messages", messageId, {
      text: "",
      html: null,
      mentions: null,
      updatedAt: event.timestamp,
      deletedAt: event.timestamp,
    });
  }
}
