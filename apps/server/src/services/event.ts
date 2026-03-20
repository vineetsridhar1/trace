import type { Prisma } from "@prisma/client";
import type { ScopeType, EventType, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";

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

    // Always broadcast to org-level topic for discovery (e.g. new channels)
    pubsub.publish(topics.orgEvents(input.organizationId), { orgEvents: event });

    return event;
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
