import { randomUUID } from "crypto";
import type { Event as PrismaEvent, Prisma } from "@prisma/client";
import type { ScopeType, EventType, ActorType } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { pubsub, topics } from "../lib/pubsub.js";
import { redis } from "../lib/redis.js";
import { isLocalMode } from "../lib/mode.js";
import { pushNotificationService } from "./pushNotificationService.js";

export interface CreateEventInput {
  id?: string;
  organizationId: string;
  scopeType: ScopeType;
  scopeId: string;
  eventType: EventType;
  payload: Prisma.InputJsonValue;
  actorType: ActorType;
  actorId: string;
  parentId?: string;
  metadata?: Prisma.InputJsonValue;
  deferPublish?: boolean;
  timestamp?: Date;
}

export interface EventQueryOpts {
  scopeType?: ScopeType;
  scopeId?: string;
  types?: EventType[];
  after?: Date;
  afterEventId?: string;
  before?: Date;
  beforeEventId?: string;
  limit?: number;
  /** When true, exclude events that are thread replies (parentId IS NOT NULL) */
  excludeReplies?: boolean;
  /** Exclude events whose JSON payload.type field matches any of these values */
  excludePayloadTypes?: string[];
}

export function excludeSessionOutputPayloadTypesWhere(
  excludePayloadTypes: string[] | undefined,
): Prisma.EventWhereInput | undefined {
  if (!excludePayloadTypes?.length) return undefined;

  // Only exclude session_output events by payload.type discriminator.
  // Using a bare NOT with JSON path filtering would exclude ALL events
  // where payload.type is missing (NULL = 'x' -> NULL, NOT NULL -> NULL -> excluded),
  // silently dropping message_sent, session_started, etc.
  return {
    NOT: {
      AND: [
        { eventType: "session_output" },
        {
          OR: excludePayloadTypes.map((type) => ({
            payload: { path: ["type"], equals: type },
          })),
        },
      ],
    },
  };
}

/**
 * session_output subtypes that carry metadata relevant to all clients
 * (sidebar status, session names, connection state, checkpoints).
 * Only these are broadcast on the org-wide topic. Pure content events
 * (assistant, result, error) are only sent via the session-scoped topic.
 */
const ORG_RELEVANT_OUTPUT_SUBTYPES = new Set([
  "workspace_ready",
  "workspace_failed",
  "title_generated",
  "question_pending",
  "plan_pending",
  "connection_lost",
  "connection_restored",
  "recovery_failed",
  "recovery_requested",
  "session_rehomed",
  "git_checkpoint",
  "git_checkpoint_rewrite",
  "config_changed",
  "branch_renamed",
  "worktree_imported",
]);

// Maps scope types to their pubsub topic builders.
// Keys must match the GraphQL subscription field names (e.g. "channel" → "channelEvents").
const scopeTopicMap: Record<string, (id: string) => string> = {
  channel: topics.channelEvents,
  chat: topics.chatEvents,
  ticket: topics.ticketEvents,
  // "system" scope has no entity-level topic — events are broadcast on the org topic only
};

type TxClient = Prisma.TransactionClient;

function eventCursorWhere(
  direction: "after" | "before",
  timestamp: Date,
  eventId: string | undefined,
): Prisma.EventWhereInput {
  const filters: Prisma.EventWhereInput[] = [
    { timestamp: direction === "after" ? { gt: timestamp } : { lt: timestamp } },
  ];

  if (eventId) {
    filters.push({
      AND: [{ timestamp }, { id: direction === "after" ? { gt: eventId } : { lt: eventId } }],
    });
  }

  return { OR: filters };
}

export class EventService {
  async create(input: CreateEventInput, tx?: TxClient) {
    const db = tx ?? prisma;

    const event = await db.event.create({
      data: {
        id: input.id,
        organizationId: input.organizationId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        eventType: input.eventType,
        payload: input.payload,
        actorType: input.actorType,
        actorId: input.actorId,
        parentId: input.parentId,
        metadata: input.metadata ?? {},
        timestamp: input.timestamp,
      },
    });

    if (!input.deferPublish) {
      this.publishCreated(event);
    }

    return event;
  }

  /**
   * Broadcast a transient event WITHOUT persisting it (no DB row, no Redis
   * agent stream, no push notifications). For high-volume streams that already
   * have their own durable, pruned entity table (app process logs): writing an
   * immutable Event per chunk would grow the append-only event log without
   * bound. Clients receive it on the same session/org topics as a real event.
   */
  publishEphemeral(input: CreateEventInput): void {
    const event = {
      id: input.id ?? randomUUID(),
      organizationId: input.organizationId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      eventType: input.eventType,
      payload: input.payload,
      actorType: input.actorType,
      actorId: input.actorId,
      parentId: input.parentId ?? null,
      metadata: input.metadata ?? {},
      timestamp: input.timestamp ?? new Date(),
    } as unknown as PrismaEvent;

    if (event.scopeType === "session") {
      pubsub.publish(topics.sessionEvents(event.scopeId), { sessionEvents: event });
    }
    pubsub.publish(topics.orgEvents(event.organizationId), { orgEvents: event });
  }

  publishCreated(event: PrismaEvent, recipientUserIds: readonly string[] = []) {
    // Broadcast to entity-scoped topic (e.g. channel:<id>:events)
    const topicBuilder = scopeTopicMap[event.scopeType];
    if (topicBuilder) {
      pubsub.publish(topicBuilder(event.scopeId), { [`${event.scopeType}Events`]: event });
    }

    // For session-scoped events, also publish to the session-specific topic
    // so session detail views get full payloads via their own subscription.
    if (event.scopeType === "session") {
      pubsub.publish(topics.sessionEvents(event.scopeId), { sessionEvents: event });
    }

    // Phase 3B: Skip org broadcast for chat events — they already go to chat:<id>:events
    // and broadcasting to org topic only triggers per-event membership checks for non-members.
    if (event.scopeType === "chat") {
      const userEnvelope = this.chatUserEnvelope(event);
      for (const userId of new Set(recipientUserIds)) {
        pubsub.publish(topics.userEvents(event.organizationId, userId), {
          userEvents: userEnvelope,
        });
      }
      // Still append to Redis stream for agent worker
      this.appendToStream(event.organizationId, event);
      return event;
    }

    // For session_output events, only broadcast to the org topic when the
    // subtype carries metadata that the sidebar/session list needs (status
    // changes, titles, connection state, checkpoints). Pure content events
    // (assistant messages, tool output, results) are noise at the org level —
    // viewers of a specific session get full payloads via sessionEvents.
    if (event.eventType === "session_output") {
      const p =
        event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : ({} as Record<string, unknown>);
      const subtype = p.type as string | undefined;
      if (subtype && ORG_RELEVANT_OUTPUT_SUBTYPES.has(subtype)) {
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
          payload: this.trimSessionOutputPayload(event.payload as Prisma.InputJsonValue),
        };
        pubsub.publish(topics.orgEvents(event.organizationId), { orgEvents: thinEnvelope });
      }
    } else {
      // All other events: broadcast full event to org topic
      pubsub.publish(topics.orgEvents(event.organizationId), { orgEvents: event });
    }

    // Append to org-scoped Redis Stream for durable consumption by the agent worker
    this.appendToStream(event.organizationId, event);
    void pushNotificationService.notifyForEvent(event).catch((err: Error) => {
      console.error("[push-notifications] event notification failed:", err.message);
    });

    return event;
  }

  publishPrivateUserEvent(event: PrismaEvent, recipientUserIds: readonly string[]) {
    for (const userId of new Set(recipientUserIds)) {
      pubsub.publish(topics.userEvents(event.organizationId, userId), { userEvents: event });
    }
    return event;
  }

  private chatUserEnvelope(event: PrismaEvent): PrismaEvent {
    if (
      event.eventType !== "message_sent" &&
      event.eventType !== "message_edited" &&
      event.eventType !== "message_deleted"
    ) {
      return event;
    }

    const payload =
      event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : {};
    const text = typeof payload.text === "string" ? payload.text.slice(0, 160) : undefined;

    return {
      ...event,
      payload: {
        messageId: payload.messageId,
        chatId: payload.chatId,
        parentMessageId: payload.parentMessageId,
        clientMutationId: payload.clientMutationId,
        createdAt: payload.createdAt,
        editedAt: payload.editedAt,
        deletedAt: payload.deletedAt,
        ...(text !== undefined ? { text } : {}),
      } as Prisma.JsonValue,
    };
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
    if (p.branch !== undefined) trimmed.branch = p.branch;
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
    if (isLocalMode()) return;
    const streamKey = `stream:org:${organizationId}:events`;
    redis.xadd(streamKey, "*", "event", JSON.stringify(event)).catch((err: Error) => {
      console.error(`[event-service] XADD to ${streamKey} failed:`, err.message);
    });
  }

  async query(organizationId: string, opts: EventQueryOpts) {
    const where: Prisma.EventWhereInput = { organizationId };

    if (opts.scopeType) where.scopeType = opts.scopeType;
    if (opts.scopeId) where.scopeId = opts.scopeId;
    if (opts.types?.length) where.eventType = { in: opts.types };
    if (opts.excludeReplies) where.parentId = null;
    Object.assign(where, excludeSessionOutputPayloadTypesWhere(opts.excludePayloadTypes));
    const cursorFilters: Prisma.EventWhereInput[] = [];
    if (opts.after) {
      cursorFilters.push(eventCursorWhere("after", opts.after, opts.afterEventId));
    }
    if (opts.before) {
      cursorFilters.push(eventCursorWhere("before", opts.before, opts.beforeEventId));
    }
    if (cursorFilters.length > 0) {
      where.AND = cursorFilters;
    }

    // When paginating backwards (before cursor), fetch in desc order then reverse
    // so the caller always gets events in ascending chronological order.
    const isBefore = !!opts.before && !opts.after;
    const limit = opts.limit ?? 200;

    const events = await prisma.event.findMany({
      where,
      orderBy: [
        { timestamp: isBefore ? "desc" : "asc" },
        { id: isBefore ? "desc" : "asc" },
      ],
      take: limit,
    });

    return isBefore ? events.reverse() : events;
  }
}

export const eventService = new EventService();
