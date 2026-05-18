import type { Context } from "../context.js";
import type { ScopeInput, EventType } from "@trace/gql";
import { eventService } from "../services/event.js";
import { sessionTimelineService } from "../services/session-timeline.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { filterAsyncIterator } from "../lib/async-iterator.js";
import {
  assertChannelAccess,
  assertChatAccess,
  assertScopeAccess,
  canViewSessionGroup,
} from "../services/access.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";
import { prisma } from "../lib/db.js";

const CHANNEL_MESSAGE_EVENTS = new Set<EventType>([
  "message_sent",
  "message_edited",
  "message_deleted",
]);

function canViewSystemEvent(
  event: { eventType: string; payload?: unknown },
  userId: string | null | undefined,
): boolean {
  if (
    event.eventType !== "bridge_access_requested" &&
    event.eventType !== "bridge_access_request_resolved" &&
    event.eventType !== "bridge_access_revoked"
  ) {
    return true;
  }

  if (
    !userId ||
    !event.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  ) {
    return false;
  }

  const payload = event.payload as {
    ownerUserId?: unknown;
    granteeUserId?: unknown;
    requesterUser?: { id?: unknown } | null;
  };
  if (payload.ownerUserId === userId) return true;
  if (
    event.eventType === "bridge_access_request_resolved" &&
    payload.requesterUser &&
    typeof payload.requesterUser === "object" &&
    payload.requesterUser.id === userId
  ) {
    return true;
  }
  if (event.eventType === "bridge_access_revoked" && payload.granteeUserId === userId) {
    return true;
  }
  return false;
}

function eventPayloadRecord(event: { payload?: unknown }): Record<string, unknown> | null {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>)
    : null;
}

function eventPayloadSessionGroupId(payload: Record<string, unknown> | null): string | null {
  if (typeof payload?.sessionGroupId === "string") return payload.sessionGroupId;
  const payloadGroup = payload?.sessionGroup;
  if (!payloadGroup || typeof payloadGroup !== "object" || Array.isArray(payloadGroup)) {
    return null;
  }
  const id = (payloadGroup as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

async function resolveEventSessionGroup(
  event: { scopeType: string; scopeId: string; eventType: string; payload?: unknown },
  organizationId: string,
  cache: Map<string, { visibility: string; ownerUserId: string } | null>,
) {
  const payload = eventPayloadRecord(event);
  const payloadGroupId = eventPayloadSessionGroupId(payload);
  const cacheKey =
    payloadGroupId ?? (event.scopeType === "session" ? `session:${event.scopeId}` : null);
  if (!cacheKey) return null;
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const group = payloadGroupId
    ? await prisma.sessionGroup.findFirst({
        where: { id: payloadGroupId, organizationId },
        select: { visibility: true, ownerUserId: true },
      })
    : await prisma.session
        .findFirst({
          where: { id: event.scopeId, organizationId },
          select: {
            sessionGroup: {
              select: { visibility: true, ownerUserId: true },
            },
          },
        })
        .then((session) => session?.sessionGroup ?? null);
  cache.set(cacheKey, group);
  return group;
}

async function canViewSessionEvent(
  event: { scopeType: string; scopeId: string; eventType: string; payload?: unknown },
  organizationId: string,
  userId: string,
  cache: Map<string, { visibility: string; ownerUserId: string } | null>,
): Promise<boolean> {
  const payload = eventPayloadRecord(event);
  if (
    event.eventType === "session_group_visibility_updated" &&
    payload?.removed === true &&
    typeof payload.ownerUserId === "string"
  ) {
    return payload.ownerUserId !== userId;
  }

  const group = await resolveEventSessionGroup(event, organizationId, cache);
  return !group || canViewSessionGroup(group, userId);
}

export const eventQueries = {
  events: async (
    _: unknown,
    args: {
      organizationId: string;
      scope?: ScopeInput;
      types?: EventType[];
      after?: Date;
      afterEventId?: string;
      before?: Date;
      beforeEventId?: string;
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
      afterEventId: args.afterEventId,
      before: args.before,
      beforeEventId: args.beforeEventId,
      limit: args.limit,
      excludePayloadTypes: args.excludePayloadTypes,
    });

    if (args.scope?.type === "chat") {
      return events;
    }

    // Batch-check membership instead of per-event N+1 queries
    const chatIds = new Set<string>();
    const channelIds = new Set<string>();
    const sessionVisibilityCache = new Map<
      string,
      { visibility: string; ownerUserId: string } | null
    >();
    for (const event of events) {
      if (event.scopeType === "chat") {
        chatIds.add(event.scopeId);
      } else if (
        event.scopeType === "channel" &&
        CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)
      ) {
        channelIds.add(event.scopeId);
      }
    }

    // Two batch queries instead of N individual queries
    const [chatMembership, channelMembership] = await Promise.all([
      chatIds.size > 0
        ? Promise.all([...chatIds].map((id) => ctx.chatMembershipLoader.load(id))).then(
            (results) => {
              const map = new Map<string, boolean>();
              [...chatIds].forEach((id, i) => map.set(id, results[i]));
              return map;
            },
          )
        : Promise.resolve(new Map<string, boolean>()),
      channelIds.size > 0
        ? Promise.all([...channelIds].map((id) => ctx.channelMembershipLoader.load(id))).then(
            (results) => {
              const map = new Map<string, boolean>();
              [...channelIds].forEach((id, i) => map.set(id, results[i]));
              return map;
            },
          )
        : Promise.resolve(new Map<string, boolean>()),
    ]);

    type QueriedEvent = {
      scopeType: string;
      scopeId: string;
      eventType: string;
      payload?: unknown;
    };
    const filtered: QueriedEvent[] = [];
    for (const event of events as QueriedEvent[]) {
      if (!canViewSystemEvent(event, ctx.userId)) {
        continue;
      }
      if (event.scopeType === "chat") {
        if (chatMembership.get(event.scopeId) ?? false) filtered.push(event);
        continue;
      }
      if (
        event.scopeType === "channel" &&
        CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)
      ) {
        if (channelMembership.get(event.scopeId) ?? false) filtered.push(event);
        continue;
      }
      if (
        await canViewSessionEvent(event, args.organizationId, ctx.userId, sessionVisibilityCache)
      ) {
        filtered.push(event);
      }
    }
    return filtered;
  },

  sessionTimeline: async (
    _: unknown,
    args: {
      organizationId: string;
      sessionId: string;
      before?: Date;
      beforeEventId?: string;
      limit?: number;
      excludePayloadTypes?: string[];
    },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.organizationId) {
      throw new Error("Not authorized for this organization");
    }

    await assertScopeAccess("session", args.sessionId, ctx.userId, ctx.organizationId);

    return sessionTimelineService.query({
      organizationId: args.organizationId,
      sessionId: args.sessionId,
      before: args.before,
      beforeEventId: args.beforeEventId,
      limit: args.limit,
      excludePayloadTypes: args.excludePayloadTypes,
    });
  },

  sessionEventsAroundEvent: async (
    _: unknown,
    args: {
      organizationId: string;
      sessionId: string;
      eventId: string;
      limit?: number;
      excludePayloadTypes?: string[];
    },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.organizationId) {
      throw new Error("Not authorized for this organization");
    }

    await assertScopeAccess("session", args.sessionId, ctx.userId, ctx.organizationId);

    return sessionTimelineService.queryEventsAroundEvent({
      organizationId: args.organizationId,
      sessionId: args.sessionId,
      eventId: args.eventId,
      limit: args.limit,
      excludePayloadTypes: args.excludePayloadTypes,
    });
  },

  sessionPromptIndex: async (
    _: unknown,
    args: { organizationId: string; sessionId: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    if (orgId !== args.organizationId) {
      throw new Error("Not authorized for this organization");
    }

    await assertScopeAccess("session", args.sessionId, ctx.userId, ctx.organizationId);

    return sessionTimelineService.queryPromptIndex({
      organizationId: args.organizationId,
      sessionId: args.sessionId,
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
      const sessionVisibilityCache = new Map<
        string,
        { visibility: string; ownerUserId: string } | null
      >();

      return filterAsyncIterator(
        pubsub.asyncIterator<{
          orgEvents: {
            scopeType: string;
            scopeId: string;
            eventType: EventType;
            payload?: unknown;
          };
        }>(topics.orgEvents(args.organizationId)),
        async (payload) => {
          const event = payload.orgEvents;

          if (!canViewSystemEvent(event, ctx.userId)) {
            return false;
          }

          // Invalidate cache on membership changes
          if (
            event.eventType === "channel_member_added" ||
            event.eventType === "channel_member_removed" ||
            event.eventType === "chat_member_added" ||
            event.eventType === "chat_member_removed" ||
            event.eventType === "session_group_visibility_updated"
          ) {
            membershipCache.delete(`${event.scopeType}:${event.scopeId}`);
            sessionVisibilityCache.clear();
          }

          if (event.scopeType === "chat") {
            const cacheKey = `chat:${event.scopeId}`;
            const cached = membershipCache.get(cacheKey);
            if (cached !== undefined) return cached;
            const result = await ctx.chatMembershipLoader.load(event.scopeId);
            membershipCache.set(cacheKey, result);
            return result;
          }
          if (
            event.scopeType === "channel" &&
            CHANNEL_MESSAGE_EVENTS.has(event.eventType as EventType)
          ) {
            const cacheKey = `channel:${event.scopeId}`;
            const cached = membershipCache.get(cacheKey);
            if (cached !== undefined) return cached;
            const result = await ctx.channelMembershipLoader.load(event.scopeId);
            membershipCache.set(cacheKey, result);
            return result;
          }
          return canViewSessionEvent(
            event,
            args.organizationId,
            ctx.userId,
            sessionVisibilityCache,
          );
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
    subscribe: async (
      _: unknown,
      args: { sessionId: string; organizationId: string },
      ctx: Context,
    ) => {
      assertOrgAccess(ctx, args.organizationId);
      await assertScopeAccess("session", args.sessionId, ctx.userId, ctx.organizationId);
      const sessionVisibilityCache = new Map<
        string,
        { visibility: string; ownerUserId: string } | null
      >();
      return filterAsyncIterator(
        pubsub.asyncIterator<{
          sessionEvents: {
            scopeType: string;
            scopeId: string;
            eventType: EventType;
            payload?: unknown;
          };
        }>(topics.sessionEvents(args.sessionId)),
        async (payload) =>
          canViewSessionEvent(
            payload.sessionEvents,
            args.organizationId,
            ctx.userId,
            sessionVisibilityCache,
          ),
      );
    },
  },
};
