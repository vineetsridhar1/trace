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
  limit?: number;
}

// Maps scope types to their pubsub topic builders.
// Keys must match the GraphQL subscription field names (e.g. "channel" → "channelEvents").
const scopeTopicMap: Record<string, (id: string) => string> = {
  channel: topics.channelEvents,
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
    if (opts.after) where.timestamp = { gt: opts.after };

    return prisma.event.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: opts.limit ?? 200,
    });
  }
}

export const eventService = new EventService();
