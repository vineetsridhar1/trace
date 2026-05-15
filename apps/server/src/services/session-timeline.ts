import type { Event as PrismaEvent, Prisma } from "@prisma/client";
import type { SessionTimelineMode } from "@trace/gql";
import { prisma } from "../lib/db.js";
import { eventService, excludeSessionOutputPayloadTypesWhere } from "./event.js";

const DEFAULT_PAGE_SIZE = 100;
const COMPACT_CANDIDATE_OVERFETCH = 4;

export interface CollapsedSessionEventRange {
  id: string;
  eventCount: number;
  toolCallCount: number;
  messageCount: number;
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

function hasRenderedTextBlock(payload: unknown): boolean {
  return messageContentBlocks(payload).some(
    (block) => block.type === "text" && typeof block.text === "string" && block.text.trim() !== "",
  );
}

function hasRenderableContentBlock(payload: unknown): boolean {
  return messageContentBlocks(payload).some((block) => {
    if (block.type === "text") {
      return typeof block.text === "string" && block.text.trim() !== "";
    }
    return block.type === "tool_use" || block.type === "plan" || block.type === "question";
  });
}

function countToolUseBlocks(payload: unknown): number {
  return messageContentBlocks(payload).reduce((count, block) => {
    return block.type === "tool_use" ? count + 1 : count;
  }, 0);
}

function hasUserContent(event: Pick<PrismaEvent, "eventType" | "payload">): boolean {
  const payload = asObject(event.payload);
  if (event.eventType === "session_started") {
    return typeof payload?.prompt === "string" && payload.prompt.trim() !== "";
  }
  if (event.eventType === "message_sent") {
    return typeof payload?.text === "string" && payload.text.trim() !== "";
  }
  return false;
}

function countHiddenMessages(event: Pick<PrismaEvent, "eventType" | "payload">): number {
  if (event.eventType === "session_started" || event.eventType === "message_sent") {
    return hasUserContent(event) ? 1 : 0;
  }
  if (event.eventType !== "session_output") return 0;
  return hasRenderedTextBlock(event.payload) ? 1 : 0;
}

function countHiddenToolCalls(event: Pick<PrismaEvent, "eventType" | "payload">): number {
  if (event.eventType !== "session_output") return 0;
  return countToolUseBlocks(event.payload);
}

function hasRenderableSessionOutput(payload: unknown): boolean {
  const data = asObject(payload);
  if (data?.type === "assistant" || data?.type === "user") {
    return hasRenderableContentBlock(payload);
  }
  return data?.type === "error";
}

function isRenderableHiddenEvent(
  event: Pick<PrismaEvent, "eventType" | "payload" | "parentId">,
): boolean {
  if (event.parentId) return false;

  if (event.eventType === "session_started" || event.eventType === "message_sent") {
    return hasUserContent(event);
  }
  if (event.eventType === "session_output") {
    return hasRenderableSessionOutput(event.payload);
  }

  return false;
}

function countHiddenEventSummary(
  event: Pick<PrismaEvent, "eventType" | "payload" | "parentId">,
): Pick<CollapsedSessionEventRange, "eventCount" | "toolCallCount" | "messageCount"> {
  if (!isRenderableHiddenEvent(event)) {
    return {
      eventCount: 0,
      toolCallCount: 0,
      messageCount: 0,
    };
  }

  return {
    eventCount: 1,
    toolCallCount: countHiddenToolCalls(event),
    messageCount: countHiddenMessages(event),
  };
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
  timestamp?: Prisma.DateTimeFilter,
): Prisma.EventWhereInput {
  return {
    organizationId,
    scopeType: "session",
    scopeId: sessionId,
    parentId: null,
    ...(timestamp ? { timestamp } : {}),
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
  let includeCursor = Boolean(opts.before);

  for (;;) {
    const timestamp = cursor ? (includeCursor ? { lte: cursor } : { lt: cursor }) : undefined;
    const chunk = await prisma.event.findMany({
      where: compactCandidateWhere(
        opts.organizationId,
        opts.sessionId,
        opts.excludePayloadTypes,
        timestamp,
      ),
      orderBy: { timestamp: "desc" },
      take: chunkSize,
    });

    if (chunk.length === 0) break;

    candidatesDesc.push(...chunk);
    const visibleCount = compactVisibleEvents([...candidatesDesc].reverse()).length;
    const hasMoreCandidates = chunk.length === chunkSize;
    if (visibleCount >= limit + 2 || !hasMoreCandidates) break;

    cursor = chunk[chunk.length - 1].timestamp;
    includeCursor = false;
  }

  return candidatesDesc.reverse();
}

async function summarizeHiddenRanges(
  opts: SessionTimelineQueryOpts,
  endpoints: PrismaEvent[],
): Promise<
  Map<string, Pick<CollapsedSessionEventRange, "eventCount" | "toolCallCount" | "messageCount">>
> {
  const summaries = new Map<
    string,
    Pick<CollapsedSessionEventRange, "eventCount" | "toolCallCount" | "messageCount">
  >();

  for (let i = 1; i < endpoints.length; i++) {
    summaries.set(collapsedRangeId(endpoints[i - 1], endpoints[i]), {
      eventCount: 0,
      toolCallCount: 0,
      messageCount: 0,
    });
  }

  if (endpoints.length < 2) return summaries;

  const endpointIds = new Set(endpoints.map((event) => event.id));
  const hiddenEvents = await prisma.event.findMany({
    where: {
      ...hiddenRangeWhere(
        opts.organizationId,
        opts.sessionId,
        endpoints[0].timestamp,
        endpoints[endpoints.length - 1].timestamp,
        opts.excludePayloadTypes,
      ),
      id: { notIn: [...endpointIds] },
    },
    orderBy: { timestamp: "asc" },
    select: { eventType: true, payload: true, parentId: true, timestamp: true },
  });

  let gapIndex = 0;
  for (const event of hiddenEvents) {
    while (
      gapIndex < endpoints.length - 1 &&
      event.timestamp >= endpoints[gapIndex + 1].timestamp
    ) {
      gapIndex++;
    }
    if (gapIndex >= endpoints.length - 1) break;
    if (event.timestamp <= endpoints[gapIndex].timestamp) continue;

    const summary = summaries.get(
      collapsedRangeId(endpoints[gapIndex], endpoints[gapIndex + 1]),
    );
    if (!summary) continue;

    const counts = countHiddenEventSummary(event);
    summary.eventCount += counts.eventCount;
    summary.toolCallCount += counts.toolCallCount;
    summary.messageCount += counts.messageCount;
  }

  return summaries;
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
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const candidates = await fetchCompactCandidates(opts, limit);
    const visibleEvents = compactVisibleEvents(candidates);
    const hasUser = visibleEvents.some(isUserEvent);
    const hasAssistant = visibleEvents.some(isAssistantTextEvent);

    if (!hasUser || !hasAssistant) return null;

    const hasAnchor =
      opts.before !== undefined &&
      visibleEvents.length > 0 &&
      sameTimestamp(visibleEvents[visibleEvents.length - 1].timestamp, opts.before);
    const anchor = hasAnchor ? visibleEvents[visibleEvents.length - 1] : null;
    const selectableEvents = anchor ? visibleEvents.slice(0, -1) : visibleEvents;
    const hasOlder = selectableEvents.length > limit;
    const pageEvents = selectableEvents.slice(Math.max(0, selectableEvents.length - limit));
    const rangeEndpoints = anchor ? [...pageEvents, anchor] : pageEvents;
    const summaries = await summarizeHiddenRanges(opts, rangeEndpoints);
    const items: SessionTimelineServiceItem[] = [];
    let previous: PrismaEvent | null = null;

    const pushCollapsedRange = (rangeStart: PrismaEvent, rangeEnd: PrismaEvent) => {
      const summary = summaries.get(collapsedRangeId(rangeStart, rangeEnd));
      if (!summary || summary.eventCount === 0) return;
      const id = collapsedRangeId(rangeStart, rangeEnd);
      items.push({
        id,
        kind: "collapsed_events",
        event: null,
        collapsed: {
          id,
          ...summary,
          startTimestamp: rangeStart.timestamp,
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
