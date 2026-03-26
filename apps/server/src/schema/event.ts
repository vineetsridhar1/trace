import type { Context } from "../context.js";
import type { ScopeInput, EventType } from "@trace/gql";
import { eventService } from "../services/event.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { filterAsyncIterator } from "../lib/async-iterator.js";
import { assertChannelAccess, assertChatAccess, isActiveChannelMember, isActiveChatMember, isAiConversationAccessible } from "../services/access.js";
import { requireOrgContext } from "../lib/require-org.js";

const CHANNEL_MESSAGE_EVENTS = new Set<EventType>([
  "message_sent",
  "message_edited",
  "message_deleted",
]);

export const eventQueries = {
  events: async (
    _: unknown,
    args: {
      organizationId: string;
      scope?: ScopeInput;
      types?: EventType[];
      after?: Date;
      before?: Date;
      limit?: number;
    },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.organizationId) {
      throw new Error("Not authorized for this organization");
    }

    if (args.scope?.type === "chat") {
      await assertChatAccess(args.scope.id, ctx.userId);
    }
    if (args.scope?.type === "channel") {
      await assertChannelAccess(args.scope.id, ctx.userId);
    }

    const events = await eventService.query(args.organizationId, {
      scopeType: args.scope?.type,
      scopeId: args.scope?.id,
      types: args.types,
      after: args.after,
      before: args.before,
      limit: args.limit,
    });

    if (args.scope?.type === "chat") {
      return events;
    }

    const visibility = await Promise.all(
      events.map(async (event) => {
        if (event.scopeType === "chat") {
          return isActiveChatMember(event.scopeId, ctx.userId);
        }
        if (event.scopeType === "channel" && CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)) {
          return isActiveChannelMember(event.scopeId, ctx.userId);
        }
        return true;
      }),
    );

    return events.filter((_, index) => visibility[index]);
  },
};

export const eventSubscriptions = {
  orgEvents: {
    subscribe: (_: unknown, args: { organizationId: string }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }

      return filterAsyncIterator(
        pubsub.asyncIterator<{ orgEvents: { scopeType: string; scopeId: string; eventType: EventType } }>(
          topics.orgEvents(args.organizationId),
        ),
        async (payload) => {
          const event = payload.orgEvents;
          if (event.scopeType === "chat") {
            return isActiveChatMember(event.scopeId, ctx.userId);
          }
          if (event.scopeType === "channel" && CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)) {
            return isActiveChannelMember(event.scopeId, ctx.userId);
          }
          if (event.scopeType === "ai_conversation") {
            return isAiConversationAccessible(event.scopeId, ctx.userId);
          }
          return true;
        },
      );
    },
  },
  userNotifications: {
    subscribe: (_: unknown, args: { organizationId: string }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      return pubsub.asyncIterator(topics.userNotifications(args.organizationId, ctx.userId));
    },
  },
};
