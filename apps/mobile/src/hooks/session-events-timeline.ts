import type { Event } from "@trace/gql";

export interface CollapsedSessionEventsSummary {
  id: string;
  startEventId: string;
  startTimestamp: string;
  endEventId: string;
  endTimestamp: string;
}

export interface EventCursor {
  timestamp: string;
  eventId: string;
}

export type SessionTimelineDisplayItem =
  | { kind: "event"; id: string }
  | {
      kind: "collapsed_events";
      id: string;
      collapsed: CollapsedSessionEventsSummary;
    };

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asFetchedEvent(value: unknown): (Event & { id: string }) | null {
  const record = asRecord(value);
  return typeof record?.id === "string" ? (record as Event & { id: string }) : null;
}

export function asCollapsedSummary(value: unknown): CollapsedSessionEventsSummary | null {
  const record = asRecord(value);
  if (
    typeof record?.id !== "string" ||
    typeof record.startEventId !== "string" ||
    typeof record.startTimestamp !== "string" ||
    typeof record.endEventId !== "string" ||
    typeof record.endTimestamp !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    startEventId: record.startEventId,
    startTimestamp: record.startTimestamp,
    endEventId: record.endEventId,
    endTimestamp: record.endTimestamp,
  };
}
