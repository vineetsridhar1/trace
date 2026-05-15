import type { Event as PrismaEvent, Prisma } from "@prisma/client";
import type { SessionTimelineMode } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService, excludeSessionOutputPayloadTypesWhere } from "./event.js";

const DEFAULT_PAGE_SIZE = 100;
const COMPACT_CANDIDATE_OVERFETCH = 4;

export interface CollapsedSessionEventRange {
  id: string;
  startEventId: string;
  startTimestamp: Date;
  endEventId: string;
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
  beforeEventId?: string;
  limit?: number;
  excludePayloadTypes?: string[];
}

const COMPACT_VISIBLE_EVENT_TYPES = [
  "session_started",
  "message_sent",
  "session_pr_opened",
  "session_pr_merged",
  "session_pr_closed",
] as const;

function compareEvents(
  a: Pick<PrismaEvent, "timestamp" | "id">,
  b: Pick<PrismaEvent, "timestamp" | "id">,
): number {
  const timestampDiff = a.timestamp.getTime() - b.timestamp.getTime();
  if (timestampDiff !== 0) return timestampDiff;
  return a.id.localeCompare(b.id);
}

function eventBeforeCursorWhere(
  timestamp: Date,
  eventId: string | undefined,
  inclusive: boolean,
): Prisma.EventWhereInput {
  const filters: Prisma.EventWhereInput[] = [
    { timestamp: inclusive && !eventId ? { lte: timestamp } : { lt: timestamp } },
  ];

  if (eventId) {
    filters.push({
      AND: [{ timestamp }, { id: inclusive ? { lte: eventId } : { lt: eventId } }],
    });
  }

  return { OR: filters };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasNonEmptyStringKey(value: unknown): boolean {
  return Array.isArray(value) && value.some((key) => typeof key === "string" && key.length > 0);
}

function hasAttachmentKeys(payload: Record<string, unknown> | null): boolean {
  return hasNonEmptyStringKey(payload?.attachmentKeys) || hasNonEmptyStringKey(payload?.imageKeys);
}

function messageContentBlocks(payload: unknown): Record<string, unknown>[] {
  const data = asObject(payload);
  if (data?.type !== "assistant" && data?.type !== "user") return [];

  const message = asObject(data.message);
  const content = message?.content;
  if (!Array.isArray(content)) return [];

  return content.flatMap((rawBlock) => {
    const block = asObject(rawBlock);
    return block ? [block] : [];
  });
}

function hasAssistantTextBlock(payload: unknown): boolean {
  const data = asObject(payload);
  if (data?.type !== "assistant") return false;

  return messageContentBlocks(payload).some(
    (block) => block.type === "text" && typeof block.text === "string" && block.text.trim() !== "",
  );
}

function hasThinkingBlock(payload: unknown): boolean {
  const data = asObject(payload);
  if (data?.type !== "assistant") return false;

  return messageContentBlocks(payload).some((block) => {
    if (block.type === "text") {
      return typeof block.text === "string" && block.text.trim() !== "";
    }
    return block.type === "tool_use" || block.type === "plan" || block.type === "question";
  });
}

function hasUserContent(event: Pick<PrismaEvent, "eventType" | "payload">): boolean {
  const payload = asObject(event.payload);
  if (event.eventType === "session_started") {
    return (
      (typeof payload?.prompt === "string" && payload.prompt.trim() !== "") ||
      hasAttachmentKeys(payload)
    );
  }
  if (event.eventType === "message_sent") {
    return (
      (typeof payload?.text === "string" && payload.text.trim() !== "") ||
      hasAttachmentKeys(payload)
    );
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
    event.eventType === "session_output" &&
    event.parentId == null &&
    hasAssistantTextBlock(event.payload)
  );
}

function isCompletionEvent(event: PrismaEvent): boolean {
  const payload = asObject(event.payload);
  return (
    event.eventType === "session_output" && event.parentId == null && payload?.type === "result"
  );
}

function isPrLifecycleEvent(event: PrismaEvent): boolean {
  return (
    event.eventType === "session_pr_opened" ||
    event.eventType === "session_pr_merged" ||
    event.eventType === "session_pr_closed"
  );
}

function isThinkingCandidate(event: PrismaEvent): boolean {
  return (
    event.eventType === "session_output" &&
    event.parentId == null &&
    hasThinkingBlock(event.payload)
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

    if (isPrLifecycleEvent(event)) {
      flushAssistant();
      visibleIds.add(event.id);
      continue;
    }

    if (isAssistantTextEvent(event)) {
      latestAssistantInTurn = event;
      continue;
    }

    if (isCompletionEvent(event)) {
      flushAssistant();
      visibleIds.add(event.id);
    }
  }

  flushAssistant();

  return candidates.filter((event) => visibleIds.has(event.id));
}

function compactCandidateWhere(
  organizationId: string,
  sessionId: string,
  excludePayloadTypes: string[] | undefined,
  cursor?: Prisma.EventWhereInput,
): Prisma.EventWhereInput {
  return {
    organizationId,
    scopeType: "session",
    scopeId: sessionId,
    parentId: null,
    OR: [
      { eventType: { in: [...COMPACT_VISIBLE_EVENT_TYPES] } },
      {
        eventType: "session_output",
        OR: [
          { payload: { path: ["type"], equals: "assistant" } },
          { payload: { path: ["type"], equals: "result" } },
        ],
      },
    ],
    ...(cursor ? { AND: [cursor] } : {}),
    ...excludeSessionOutputPayloadTypesWhere(excludePayloadTypes),
  };
}

function collapsedRangeId(previous: PrismaEvent, event: PrismaEvent): string {
  return `collapsed:${previous.id}:${event.id}`;
}

function sameTimestamp(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

async function fetchCompactCandidates(opts: SessionTimelineQueryOpts, limit: number) {
  const chunkSize = Math.max(DEFAULT_PAGE_SIZE, limit * COMPACT_CANDIDATE_OVERFETCH);
  const candidatesDesc: PrismaEvent[] = [];
  let cursor = opts.before;
  let cursorEventId = opts.beforeEventId;
  let includeCursor = Boolean(opts.before);

  for (;;) {
    const cursorWhere = cursor
      ? eventBeforeCursorWhere(cursor, cursorEventId, includeCursor)
      : undefined;
    const chunk = await prisma.event.findMany({
      where: compactCandidateWhere(
        opts.organizationId,
        opts.sessionId,
        opts.excludePayloadTypes,
        cursorWhere,
      ),
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: chunkSize,
    });

    if (chunk.length === 0) break;

    candidatesDesc.push(...chunk);
    const visibleCount = compactVisibleEvents([...candidatesDesc].reverse()).length;
    const hasMoreCandidates = chunk.length === chunkSize;
    if (visibleCount >= limit + 2 || !hasMoreCandidates) break;

    cursor = chunk[chunk.length - 1].timestamp;
    cursorEventId = chunk[chunk.length - 1].id;
    includeCursor = false;
  }

  return candidatesDesc.reverse();
}

function collapsedRangeIdsWithThinking(
  candidates: PrismaEvent[],
  endpoints: PrismaEvent[],
): Set<string> {
  const ranges = new Set<string>();
  if (endpoints.length < 2) return ranges;

  const endpointIds = new Set(endpoints.map((event) => event.id));
  let gapIndex = 0;

  for (const candidate of candidates) {
    while (
      gapIndex < endpoints.length - 1 &&
      compareEvents(candidate, endpoints[gapIndex + 1]) >= 0
    ) {
      gapIndex++;
    }
    if (gapIndex >= endpoints.length - 1) break;
    if (compareEvents(candidate, endpoints[gapIndex]) <= 0) continue;
    if (endpointIds.has(candidate.id)) continue;
    if (!isThinkingCandidate(candidate)) continue;

    ranges.add(collapsedRangeId(endpoints[gapIndex], endpoints[gapIndex + 1]));
  }

  return ranges;
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
      beforeEventId: opts.beforeEventId,
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
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const candidates = await fetchCompactCandidates(opts, limit);
    const visibleEvents = compactVisibleEvents(candidates);
    const hasUser = visibleEvents.some(isUserEvent);
    const hasAssistant = visibleEvents.some(isAssistantTextEvent);

    if (!hasUser || !hasAssistant) return null;

    const hasAnchor =
      opts.before !== undefined &&
      visibleEvents.length > 0 &&
      (opts.beforeEventId
        ? visibleEvents[visibleEvents.length - 1].id === opts.beforeEventId
        : sameTimestamp(visibleEvents[visibleEvents.length - 1].timestamp, opts.before));
    const anchor = hasAnchor ? visibleEvents[visibleEvents.length - 1] : null;
    const selectableEvents = anchor ? visibleEvents.slice(0, -1) : visibleEvents;
    const hasOlder = selectableEvents.length > limit;
    const pageEvents = selectableEvents.slice(Math.max(0, selectableEvents.length - limit));
    const rangeEndpoints = anchor ? [...pageEvents, anchor] : pageEvents;
    const rangesWithThinking = collapsedRangeIdsWithThinking(candidates, rangeEndpoints);
    const items: SessionTimelineServiceItem[] = [];
    let previous: PrismaEvent | null = null;

    const pushCollapsedRange = (rangeStart: PrismaEvent, rangeEnd: PrismaEvent) => {
      const id = collapsedRangeId(rangeStart, rangeEnd);
      if (!rangesWithThinking.has(id)) return;
      items.push({
        id,
        kind: "collapsed_events",
        event: null,
        collapsed: {
          id,
          startEventId: rangeStart.id,
          startTimestamp: rangeStart.timestamp,
          endEventId: rangeEnd.id,
          endTimestamp: rangeEnd.timestamp,
        },
      });
    };

    for (const event of pageEvents) {
      if (previous) {
        pushCollapsedRange(previous, event);
      }

      items.push({ id: event.id, kind: "event", event, collapsed: null });
      previous = event;
    }

    if (previous && anchor) {
      pushCollapsedRange(previous, anchor);
    }

    return { mode: "compact", items, hasOlder };
  }
}

export const sessionTimelineService = new SessionTimelineService();
