import type { Context } from "../context.js";
import type { ScopeInput, EventType } from "@trace/gql";
import { eventService } from "../services/event.js";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { filterAsyncIterator } from "../lib/async-iterator.js";
import { assertChannelAccess, assertChatAccess } from "../services/access.js";
import { requireOrgContext } from "../lib/require-org.js";

// Events scoped to a channel that require membership to view. We default to
// ALWAYS checking membership for channel-scoped events; the message subset is
// kept only for its existing semantics in the events() query helper below.
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

  if (!userId || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
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

async function isOrgMember(userId: string, organizationId: string): Promise<boolean> {
  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { userId: true },
  });
  return membership !== null;
}

async function isChannelMember(userId: string, channelId: string): Promise<boolean> {
  const membership = await prisma.channelMember.findFirst({
    where: { channelId, userId, leftAt: null },
    select: { channelId: true },
  });
  return membership !== null;
}

async function isChatMember(userId: string, chatId: string): Promise<boolean> {
  const membership = await prisma.chatMember.findFirst({
    where: { chatId, userId, leftAt: null },
    select: { chatId: true },
  });
  return membership !== null;
}

async function getSessionAccessState(
  organizationId: string,
  sessionId: string,
): Promise<{ channelId: string | null; createdById: string } | null> {
  return prisma.session.findFirst({
    where: { id: sessionId, organizationId },
    select: { channelId: true, createdById: true },
  });
}

async function hasSessionAccess(
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<boolean> {
  const session = await getSessionAccessState(organizationId, sessionId);
  if (!session) return false;
  if (session.createdById === userId) return true;
  if (!session.channelId) return false;
  return isChannelMember(userId, session.channelId);
}

async function assertSessionAccess(
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<void> {
  const session = await getSessionAccessState(organizationId, sessionId);
  if (!session) {
    throw new Error("Not authorized for this session");
  }
  if (session.createdById === userId) return;
  if (session.channelId) {
    await assertChannelAccess(session.channelId, userId);
    return;
  }
  throw new Error("Not authorized for this session");
}

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
    if (args.scope?.type === "session") {
      await assertSessionAccess(ctx.userId, orgId, args.scope.id);
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
    const sessionIds = new Set<string>();
    for (const event of events) {
      if (event.scopeType === "chat") {
        chatIds.add(event.scopeId);
      } else if (event.scopeType === "channel") {
        channelIds.add(event.scopeId);
      } else if (event.scopeType === "session") {
        sessionIds.add(event.scopeId);
      }
    }

    const sessions = sessionIds.size > 0
      ? await prisma.session.findMany({
          where: { id: { in: [...sessionIds] }, organizationId: orgId },
          select: { id: true, channelId: true, createdById: true },
        })
      : [];
    for (const session of sessions) {
      if (session.channelId) {
        channelIds.add(session.channelId);
      }
    }

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
    const sessionAccess = new Map(
      sessions.map((session) => [
        session.id,
        session.createdById === ctx.userId ||
        (!!session.channelId && (channelMembership.get(session.channelId) ?? false)),
      ]),
    );

    return events.filter((event: { scopeType: string; scopeId: string; eventType: string; payload?: unknown }) => {
      if (!canViewSystemEvent(event, ctx.userId)) {
        return false;
      }
      if (event.scopeType === "chat") {
        return chatMembership.get(event.scopeId) ?? false;
      }
      if (event.scopeType === "channel") {
        return channelMembership.get(event.scopeId) ?? false;
      }
      if (event.scopeType === "session") {
        return sessionAccess.get(event.scopeId) ?? false;
      }
      return true;
    });
  },
};

export const eventSubscriptions = {
  orgEvents: {
    subscribe: async (_: unknown, args: { organizationId: string }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      // Confirm the caller is still a member of the org at subscribe time.
      const orgMember = await prisma.orgMember.findUnique({
        where: { userId_organizationId: { userId: ctx.userId, organizationId: orgId } },
        select: { userId: true },
      });
      if (!orgMember) {
        throw new Error("Not a member of this organization");
      }

      // Short TTL cache to avoid per-event DB lookups while still catching
      // membership revocations within seconds.
      const MEMBERSHIP_TTL_MS = 5_000;
      const membershipCache = new Map<string, { value: boolean; expiresAt: number }>();
      const readCache = (key: string) => {
        const entry = membershipCache.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt < Date.now()) {
          membershipCache.delete(key);
          return undefined;
        }
        return entry.value;
      };
      const writeCache = (key: string, value: boolean) => {
        membershipCache.set(key, { value, expiresAt: Date.now() + MEMBERSHIP_TTL_MS });
      };
      const readThrough = async (
        key: string,
        loader: () => Promise<boolean>,
      ): Promise<boolean> => {
        const cached = readCache(key);
        if (cached !== undefined) return cached;
        const value = await loader();
        writeCache(key, value);
        return value;
      };

      return filterAsyncIterator(
        pubsub.asyncIterator<{
          orgEvents: {
            scopeType: string;
            scopeId: string;
            eventType: EventType;
            actorId?: string;
            payload?: Record<string, unknown>;
          };
        }>(
          topics.orgEvents(args.organizationId),
        ),
        async (payload) => {
          const event = payload.orgEvents;

          if (!canViewSystemEvent(event, ctx.userId)) {
            return false;
          }

          if (
            event.eventType === "member_left" &&
            event.payload?.userId === ctx.userId
          ) {
            return "end";
          }

          const stillMember = await readThrough(
            `org:${orgId}:${ctx.userId}`,
            () => isOrgMember(ctx.userId, orgId),
          );
          if (!stillMember) {
            return "end";
          }

          // Membership mutations invalidate cached access immediately.
          if (
            event.eventType === "channel_member_added" ||
            event.eventType === "channel_member_removed" ||
            event.eventType === "chat_member_added" ||
            event.eventType === "chat_member_removed" ||
            event.eventType === "member_left" ||
            event.eventType === "member_joined"
          ) {
            membershipCache.clear();
          }

          if (event.scopeType === "chat") {
            return readThrough(
              `chat:${event.scopeId}`,
              () => isChatMember(ctx.userId, event.scopeId),
            );
          }
          if (event.scopeType === "channel") {
            return readThrough(
              `channel:${event.scopeId}`,
              () => isChannelMember(ctx.userId, event.scopeId),
            );
          }
          if (event.scopeType === "session") {
            return readThrough(
              `session:${event.scopeId}`,
              () => hasSessionAccess(ctx.userId, orgId, event.scopeId),
            );
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
    subscribe: async (_: unknown, args: { sessionId: string; organizationId: string }, ctx: Context) => {
      const orgId = requireOrgContext(ctx);
      if (orgId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      await assertSessionAccess(ctx.userId, orgId, args.sessionId);
      return filterAsyncIterator(
        pubsub.asyncIterator(topics.sessionEvents(args.sessionId)),
        async () => {
          if (!(await isOrgMember(ctx.userId, orgId))) {
            return "end";
          }
          return (await hasSessionAccess(ctx.userId, orgId, args.sessionId)) ? "keep" : "end";
        },
      );
    },
  },
};
