import type { Context } from "../context.js";
import type { ScopeInput, EventType } from "@trace/gql";
import { eventService } from "../services/event.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { filterAsyncIterator } from "../lib/async-iterator.js";
import { assertChannelAccess, assertChatAccess } from "../services/access.js";
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
      excludePayloadTypes?: string[];
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
      excludePayloadTypes: args.excludePayloadTypes,
    });

    if (args.scope?.type === "chat") {
      return events;
    }

    // Batch-check membership instead of per-event N+1 queries
    const chatIds = new Set<string>();
    const channelIds = new Set<string>();
    for (const event of events) {
      if (event.scopeType === "chat") {
        chatIds.add(event.scopeId);
      } else if (event.scopeType === "channel" && CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)) {
        channelIds.add(event.scopeId);
      }
    }

    // Two batch queries instead of N individual queries
    const [chatMembership, channelMembership] = await Promise.all([
      chatIds.size > 0
        ? Promise.all([...chatIds].map((id) => ctx.chatMembershipLoader.load(id)))
            .then((results) => {
              const map = new Map<string, boolean>();
              [...chatIds].forEach((id, i) => map.set(id, results[i]));
              return map;
            })
        : Promise.resolve(new Map<string, boolean>()),
      channelIds.size > 0
        ? Promise.all([...channelIds].map((id) => ctx.channelMembershipLoader.load(id)))
            .then((results) => {
              const map = new Map<string, boolean>();
              [...channelIds].forEach((id, i) => map.set(id, results[i]));
              return map;
            })
        : Promise.resolve(new Map<string, boolean>()),
    ]);

    return events.filter((event: { scopeType: string; scopeId: string; eventType: string }) => {
      if (event.scopeType === "chat") {
        return chatMembership.get(event.scopeId) ?? false;
      }
      if (event.scopeType === "channel" && CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)) {
        return channelMembership.get(event.scopeId) ?? false;
      }
      return true;
    });
  },
};

export const eventSubscriptions = {
  orgEvents: {
    subscribe: (_: unknown, args: { organizationId: string }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }

      // Per-connection membership cache to avoid per-event DB calls
      const membershipCache = new Map<string, boolean>();

      return filterAsyncIterator(
        pubsub.asyncIterator<{ orgEvents: { scopeType: string; scopeId: string; eventType: EventType } }>(
          topics.orgEvents(args.organizationId),
        ),
        async (payload) => {
          const event = payload.orgEvents;

          // Invalidate cache on membership changes
          if (
            event.eventType === "channel_member_added" ||
            event.eventType === "channel_member_removed" ||
            event.eventType === "chat_member_added" ||
            event.eventType === "chat_member_removed"
          ) {
            membershipCache.delete(`${event.scopeType}:${event.scopeId}`);
          }

          if (event.scopeType === "chat") {
            const cacheKey = `chat:${event.scopeId}`;
            const cached = membershipCache.get(cacheKey);
            if (cached !== undefined) return cached;
            const result = await ctx.chatMembershipLoader.load(event.scopeId);
            membershipCache.set(cacheKey, result);
            return result;
          }
          if (event.scopeType === "channel" && CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)) {
            const cacheKey = `channel:${event.scopeId}`;
            const cached = membershipCache.get(cacheKey);
            if (cached !== undefined) return cached;
            const result = await ctx.channelMembershipLoader.load(event.scopeId);
            membershipCache.set(cacheKey, result);
            return result;
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

  sessionEvents: {
    subscribe: (_: unknown, args: { sessionId: string; organizationId: string }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      return pubsub.asyncIterator(topics.sessionEvents(args.sessionId));
    },
  },
};
