import type { Event, SessionTimelineItemKind } from "@trace/gql";

export interface CollapsedSessionEventsSummary {
  id: string;
  startTimestamp: string;
  endTimestamp: string;
}

export type SessionTimelineDisplayItem =
  | { kind: Extract<SessionTimelineItemKind, "event">; id: string }
  | {
      kind: Extract<SessionTimelineItemKind, "collapsed_events">;
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
    typeof record.startTimestamp !== "string" ||
    typeof record.endTimestamp !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    startTimestamp: record.startTimestamp,
    endTimestamp: record.endTimestamp,
  };
}
