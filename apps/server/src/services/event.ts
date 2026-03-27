import type { Prisma } from "@prisma/client";
import type { ScopeType, EventType, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { redis } from "../lib/redis.js";

export interface CreateEventInput {
  organizationId: string;
  scopeType: ScopeType;
  scopeId: string;
  eventType: EventType;
  payload: Prisma.InputJsonValue;
  actorType: ActorType;
  actorId: string;
  parentId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface EventQueryOpts {
  scopeType?: ScopeType;
  scopeId?: string;
  types?: EventType[];
  after?: Date;
  before?: Date;
  limit?: number;
  /** When true, exclude events that are thread replies (parentId IS NOT NULL) */
  excludeReplies?: boolean;
}

// Maps scope types to their pubsub topic builders.
// Keys must match the GraphQL subscription field names (e.g. "channel" → "channelEvents").
const scopeTopicMap: Record<string, (id: string) => string> = {
  channel: topics.channelEvents,
  chat: topics.chatEvents,
  ticket: topics.ticketEvents,
  // "system" scope has no entity-level topic — events are broadcast on the org topic only
};

type TxClient = Prisma.TransactionClient;

export class EventService {
  async create(input: CreateEventInput, tx?: TxClient) {
    const db = tx ?? prisma;

    const event = await db.event.create({
      data: {
        organizationId: input.organizationId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        eventType: input.eventType,
        payload: input.payload,
        actorType: input.actorType,
        actorId: input.actorId,
        parentId: input.parentId,
        metadata: input.metadata ?? {},
      },
    });

    // Broadcast to entity-scoped topic (e.g. channel:<id>:events)
    const topicBuilder = scopeTopicMap[input.scopeType];
    if (topicBuilder) {
      pubsub.publish(topicBuilder(input.scopeId), { [`${input.scopeType}Events`]: event });
    }

    // For session-scoped events, also publish to the session-specific topic
    // so session detail views get full payloads via their own subscription.
    if (input.scopeType === "session") {
      pubsub.publish(topics.sessionEvents(input.scopeId), { sessionEvents: event });
    }

    // Phase 3B: Skip org broadcast for chat events — they already go to chat:<id>:events
    // and broadcasting to org topic only triggers per-event membership checks for non-members.
    if (input.scopeType === "chat") {
      // Still append to Redis stream for agent worker
      this.appendToStream(input.organizationId, event);
      return event;
    }

    // Phase 3A: For session_output events, broadcast a metadata-only envelope
    // to the org topic to avoid sending 100KB+ payloads to every subscriber.
    // Full payloads are available via the session-scoped subscription.
    if (input.eventType === "session_output") {
      const thinEnvelope = {
        id: event.id,
        scopeType: event.scopeType,
        scopeId: event.scopeId,
        eventType: event.eventType,
        actorType: event.actorType,
        actorId: event.actorId,
        parentId: event.parentId,
        timestamp: event.timestamp,
        metadata: event.metadata,
        organizationId: event.organizationId,
        // Include minimal payload fields needed by useOrgEvents handlers
        payload: this.trimSessionOutputPayload(input.payload),
      };
      pubsub.publish(topics.orgEvents(input.organizationId), { orgEvents: thinEnvelope });
    } else {
      // All other events: broadcast full event to org topic
      pubsub.publish(topics.orgEvents(input.organizationId), { orgEvents: event });
    }

    // Append to org-scoped Redis Stream for durable consumption by the agent worker
    this.appendToStream(input.organizationId, event);

    return event;
  }

  /**
   * Extract only the metadata fields from a session_output payload
   * that useOrgEvents needs for routing and patching (type, agentStatus,
   * sessionStatus, name, workdir, connection, newSessionId, checkpoint id/sessionGroupId,
   * replacedCommitSha). Omit the bulk content (message blocks, tool output).
   */
  private trimSessionOutputPayload(payload: Prisma.InputJsonValue): Prisma.InputJsonValue {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    const p = payload as Record<string, unknown>;
    const trimmed: Record<string, unknown> = {};

    // Always keep the subtype discriminator
    if (p.type !== undefined) trimmed.type = p.type;

    // Session state fields
    if (p.agentStatus !== undefined) trimmed.agentStatus = p.agentStatus;
    if (p.sessionStatus !== undefined) trimmed.sessionStatus = p.sessionStatus;
    if (p.name !== undefined) trimmed.name = p.name;
    if (p.workdir !== undefined) trimmed.workdir = p.workdir;
    if (p.connection !== undefined) trimmed.connection = p.connection;
    if (p.newSessionId !== undefined) trimmed.newSessionId = p.newSessionId;

    // Git checkpoint metadata (keep id + sessionGroupId, drop file diffs)
    if (p.checkpoint && typeof p.checkpoint === "object") {
      trimmed.checkpoint = p.checkpoint;
    }
    if (p.replacedCommitSha !== undefined) trimmed.replacedCommitSha = p.replacedCommitSha;

    // Session group data for upsertSessionGroupFromPayload
    if (p.session !== undefined) trimmed.session = p.session;
    if (p.sessionGroup !== undefined) trimmed.sessionGroup = p.sessionGroup;

    return trimmed as Prisma.InputJsonValue;
  }

  private appendToStream(organizationId: string, event: { id: string } & Record<string, unknown>) {
    const streamKey = `stream:org:${organizationId}:events`;
    redis
      .xadd(streamKey, "*", "event", JSON.stringify(event))
      .catch((err) => {
        console.error(`[event-service] XADD to ${streamKey} failed:`, err.message);
      });
  }

  async query(organizationId: string, opts: EventQueryOpts) {
    const where: Prisma.EventWhereInput = { organizationId };

    if (opts.scopeType) where.scopeType = opts.scopeType;
    if (opts.scopeId) where.scopeId = opts.scopeId;
    if (opts.types?.length) where.eventType = { in: opts.types };
    if (opts.excludeReplies) where.parentId = null;
    const timestampFilter: Record<string, Date> = {};
    if (opts.after) timestampFilter.gt = opts.after;
    if (opts.before) timestampFilter.lt = opts.before;
    if (Object.keys(timestampFilter).length > 0) where.timestamp = timestampFilter;

    // When paginating backwards (before cursor), fetch in desc order then reverse
    // so the caller always gets events in ascending chronological order.
    const isBefore = !!opts.before && !opts.after;
    const limit = opts.limit ?? 200;

    const events = await prisma.event.findMany({
      where,
      orderBy: { timestamp: isBefore ? "desc" : "asc" },
      take: limit,
    });

    return isBefore ? events.reverse() : events;
  }
}

export const eventService = new EventService();
