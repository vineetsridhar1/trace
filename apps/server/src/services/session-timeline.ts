import type { Event as PrismaEvent, Prisma } from "@prisma/client";
import type { SessionTimelineMode } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService, excludeSessionOutputPayloadTypesWhere } from "./event.js";

const DEFAULT_PAGE_SIZE = 100;

export interface CollapsedSessionEventRange {
  id: string;
  eventCount: number;
  startTimestamp: Date;
  endTimestamp: Date;
}

export type SessionTimelineServiceItem =
  | {
      id: string;
      kind: "event";
      event: PrismaEvent;
      collapsed: null;
    }
  | {
      id: string;
      kind: "collapsed_events";
      event: null;
      collapsed: CollapsedSessionEventRange;
    };

export interface SessionTimelineServicePage {
  mode: SessionTimelineMode;
  items: SessionTimelineServiceItem[];
  hasOlder: boolean;
}

export interface SessionTimelineQueryOpts {
  organizationId: string;
  sessionId: string;
  before?: Date;
  limit?: number;
  excludePayloadTypes?: string[];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasTextBlock(payload: unknown): boolean {
  const data = asObject(payload);
  if (data?.type !== "assistant") return false;

  const message = asObject(data.message);
  const content = message?.content;
  if (!Array.isArray(content)) return false;

  return content.some((rawBlock) => {
    const block = asObject(rawBlock);
    return block?.type === "text" && typeof block.text === "string" && block.text.trim() !== "";
  });
}

function hasUserContent(event: PrismaEvent): boolean {
  const payload = asObject(event.payload);
  if (event.eventType === "session_started") {
    return typeof payload?.prompt === "string" && payload.prompt.trim() !== "";
  }
  if (event.eventType === "message_sent") {
    return typeof payload?.text === "string" && payload.text.trim() !== "";
  }
  return false;
}

function isUserEvent(event: PrismaEvent): boolean {
  return (
    (event.eventType === "session_started" || event.eventType === "message_sent") &&
    hasUserContent(event)
  );
}

function isAssistantTextEvent(event: PrismaEvent): boolean {
  return (
    event.eventType === "session_output" && event.parentId == null && hasTextBlock(event.payload)
  );
}

function compactVisibleEvents(candidates: PrismaEvent[]): PrismaEvent[] {
  const visibleIds = new Set<string>();
  let latestAssistantInTurn: PrismaEvent | null = null;

  const flushAssistant = () => {
    if (!latestAssistantInTurn) return;
    visibleIds.add(latestAssistantInTurn.id);
    latestAssistantInTurn = null;
  };

  for (const event of candidates) {
    if (isUserEvent(event)) {
      flushAssistant();
      visibleIds.add(event.id);
      continue;
    }

    if (isAssistantTextEvent(event)) {
      latestAssistantInTurn = event;
    }
  }

  flushAssistant();

  return candidates.filter((event) => visibleIds.has(event.id));
}

function compactCandidateWhere(
  organizationId: string,
  sessionId: string,
  excludePayloadTypes: string[] | undefined,
): Prisma.EventWhereInput {
  return {
    organizationId,
    scopeType: "session",
    scopeId: sessionId,
    parentId: null,
    OR: [
      { eventType: { in: ["session_started", "message_sent"] } },
      {
        eventType: "session_output",
        payload: { path: ["type"], equals: "assistant" },
      },
    ],
    ...excludeSessionOutputPayloadTypesWhere(excludePayloadTypes),
  };
}

function hiddenRangeWhere(
  organizationId: string,
  sessionId: string,
  startTimestamp: Date,
  endTimestamp: Date,
  excludePayloadTypes: string[] | undefined,
): Prisma.EventWhereInput {
  return {
    organizationId,
    scopeType: "session",
    scopeId: sessionId,
    timestamp: { gt: startTimestamp, lt: endTimestamp },
    ...excludeSessionOutputPayloadTypesWhere(excludePayloadTypes),
  };
}

export class SessionTimelineService {
  async query(opts: SessionTimelineQueryOpts): Promise<SessionTimelineServicePage> {
    const session = await prisma.session.findUnique({
      where: { id: opts.sessionId },
      select: { organizationId: true, agentStatus: true, sessionStatus: true },
    });

    if (!session || session.organizationId !== opts.organizationId) {
      return { mode: "live", items: [], hasOlder: false };
    }

    if (session.agentStatus === "done" && session.sessionStatus !== "needs_input") {
      const compact = await this.queryCompact(opts);
      if (compact) return compact;
    }

    return this.queryLive(opts);
  }

  private async queryLive(opts: SessionTimelineQueryOpts): Promise<SessionTimelineServicePage> {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const events = await eventService.query(opts.organizationId, {
      scopeType: "session",
      scopeId: opts.sessionId,
      before: opts.before,
      limit,
      excludePayloadTypes: opts.excludePayloadTypes,
    });

    return {
      mode: "live",
      items: events.map((event) => ({
        id: event.id,
        kind: "event" as const,
        event,
        collapsed: null,
      })),
      hasOlder: events.length >= limit,
    };
  }

  private async queryCompact(
    opts: SessionTimelineQueryOpts,
  ): Promise<SessionTimelineServicePage | null> {
    const candidates = await prisma.event.findMany({
      where: compactCandidateWhere(opts.organizationId, opts.sessionId, opts.excludePayloadTypes),
      orderBy: { timestamp: "asc" },
    });
    const visibleEvents = compactVisibleEvents(candidates);
    const hasUser = visibleEvents.some(isUserEvent);
    const hasAssistant = visibleEvents.some(isAssistantTextEvent);

    if (!hasUser || !hasAssistant) return null;

    const items: SessionTimelineServiceItem[] = [];
    let previous: PrismaEvent | null = null;

    for (const event of visibleEvents) {
      if (previous) {
        const eventCount = await prisma.event.count({
          where: hiddenRangeWhere(
            opts.organizationId,
            opts.sessionId,
            previous.timestamp,
            event.timestamp,
            opts.excludePayloadTypes,
          ),
        });

        if (eventCount > 0) {
          const id = `collapsed:${previous.id}:${event.id}`;
          items.push({
            id,
            kind: "collapsed_events",
            event: null,
            collapsed: {
              id,
              eventCount,
              startTimestamp: previous.timestamp,
              endTimestamp: event.timestamp,
            },
          });
        }
      }

      items.push({ id: event.id, kind: "event", event, collapsed: null });
      previous = event;
    }

    return { mode: "compact", items, hasOlder: false };
  }
}

export const sessionTimelineService = new SessionTimelineService();
