import type { Actor, Event, Message } from "@trace/gql";
import { asJsonObject, isJsonObject } from "@trace/shared";
import { useEntityStore, eventScopeKey } from "../stores/entity";
import { drainPendingOptimisticChat } from "../lib/optimistic-message";

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

function normalizeThreadRepliers(existing: Message["threadRepliers"] | null | undefined, actor: Actor) {
  const nextActor = {
    type: actor.type,
    id: actor.id,
    name: actor.name ?? null,
    avatarUrl: actor.avatarUrl ?? null,
  };

  return [
    nextActor,
    ...(existing ?? []).filter((replier) => `${replier.type}:${replier.id}` !== `${nextActor.type}:${nextActor.id}`),
  ].slice(0, 3);
}

function buildScopedMessage(scope: MessageScope, event: Event, payload: Record<string, unknown>, existing?: Message): Message {
  const parentMessageId = typeof payload.parentMessageId === "string" ? payload.parentMessageId : null;

  return {
    id: typeof payload.messageId === "string" ? payload.messageId : "",
    chatId: scope.scopeType === "chat" ? scope.scopeId : null,
    channelId: scope.scopeType === "channel" ? scope.scopeId : null,
    text: typeof payload.text === "string" ? payload.text : existing?.text ?? "",
    html: typeof payload.html === "string" ? payload.html : existing?.html ?? null,
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

    // Atomically upsert the real message AND remove any pending optimistic
    // duplicate to prevent a brief flash where both appear in the list.
    if (scope.scopeType === "chat") {
      const pending = drainPendingOptimisticChat(scope.scopeId);
      if (pending) {
        const scopeKey = eventScopeKey("chat", scope.scopeId);
        useEntityStore.setState((state) => {
          const nextMessages = { ...state.messages };
          delete nextMessages[pending.tempMessageId];
          nextMessages[messageId] = nextMessage;

          const bucket = state.eventsByScope[scopeKey];
          if (bucket && bucket[pending.tempEventId]) {
            const { [pending.tempEventId]: _, ...restBucket } = bucket;
            return {
              messages: nextMessages,
              eventsByScope: { ...state.eventsByScope, [scopeKey]: restBucket },
            };
          }
          return { messages: nextMessages };
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
