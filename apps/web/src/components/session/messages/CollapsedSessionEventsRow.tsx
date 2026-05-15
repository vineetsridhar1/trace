import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Event, GitCheckpoint } from "@trace/gql";
import {
  upsertFetchedSessionEventsWithOptimisticResolution,
  useAuthStore,
  useScopedEvents,
} from "@trace/client-core";
import { buildSessionNodes } from "../groupReadGlob";
import { useEventScopeKey } from "../EventScopeContext";
import { SessionNodeRenderer } from "../SessionNodeRenderer";
import { client } from "../../../lib/urql";
import {
  SESSION_EVENTS_QUERY,
  type CollapsedSessionEventsSummary,
} from "../../../hooks/useSessionEvents";
import { HIDDEN_SESSION_PAYLOAD_TYPES } from "../../../lib/session-event-filters";
import { cn } from "../../../lib/utils";
import { TraceLoader } from "../../ui/trace-loader";

const COLLAPSED_PAGE_SIZE = 100;
const COLLAPSED_EXPANDED_EXCLUDE_PAYLOAD_TYPES = [...HIDDEN_SESSION_PAYLOAD_TYPES, "result"];

interface CollapsedSessionEventsRowProps {
  sessionId: string;
  collapsed: CollapsedSessionEventsSummary;
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFetchedEvent(value: unknown): (Event & { id: string }) | null {
  const record = asRecord(value);
  return typeof record?.id === "string" ? (record as Event & { id: string }) : null;
}

export function CollapsedSessionEventsRow({
  sessionId,
  collapsed,
  gitCheckpointsByPromptEventId,
}: CollapsedSessionEventsRowProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [cursor, setCursor] = useState(collapsed.startTimestamp);
  const [hasMore, setHasMore] = useState(true);
  const activeOrgId = useAuthStore((s: { activeOrgId: string | null }) => s.activeOrgId);
  const scopeKey = useEventScopeKey();
  const scopedEvents = useScopedEvents(scopeKey);

  useEffect(() => {
    setOpen(false);
    setLoading(false);
    setError(null);
    setEventIds([]);
    setCursor(collapsed.startTimestamp);
    setHasMore(true);
  }, [collapsed.id, collapsed.startTimestamp]);

  const fetchNext = useCallback(async () => {
    if (!activeOrgId || loading || !hasMore) return;

    setLoading(true);
    setError(null);
    const result = await client
      .query(SESSION_EVENTS_QUERY, {
        organizationId: activeOrgId,
        scope: { type: "session", id: sessionId },
        limit: COLLAPSED_PAGE_SIZE,
        after: cursor,
        before: collapsed.endTimestamp,
        excludePayloadTypes: COLLAPSED_EXPANDED_EXCLUDE_PAYLOAD_TYPES,
      })
      .toPromise();

    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }

    const rawEvents = Array.isArray(result.data?.events) ? result.data.events : [];
    const events: Array<Event & { id: string }> = [];
    for (const rawEvent of rawEvents) {
      const event = asFetchedEvent(rawEvent);
      if (event) events.push(event);
    }

    if (events.length > 0) {
      upsertFetchedSessionEventsWithOptimisticResolution(sessionId, events);
      setEventIds((current) => {
        const seen = new Set(current);
        const next = [...current];
        for (const event of events) {
          if (seen.has(event.id)) continue;
          seen.add(event.id);
          next.push(event.id);
        }
        return next;
      });
      setCursor(events[events.length - 1].timestamp);
    }

    setHasMore(events.length === COLLAPSED_PAGE_SIZE);
    setLoading(false);
  }, [activeOrgId, collapsed.endTimestamp, cursor, hasMore, loading, sessionId]);

  const handleToggle = useCallback(() => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && eventIds.length === 0) {
      void fetchNext();
    }
  }, [eventIds.length, fetchNext, open]);

  const { nodes, completedAgentTools, toolResultByUseId } = useMemo(
    () => buildSessionNodes(eventIds, scopedEvents),
    [eventIds, scopedEvents],
  );

  return (
    <div className="overflow-hidden rounded-md">
      <button
        type="button"
        className={cn(
          "group inline-flex max-w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm leading-6 text-muted-foreground transition-colors",
          "hover:bg-surface-elevated/50 hover:text-foreground",
          open && "text-foreground",
        )}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} thinking`}
        onClick={handleToggle}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")}
          strokeWidth={2}
        />
        <span className="shrink-0 font-medium">Show thinking</span>
      </button>

      <div className={`read-group-body ${open ? "open" : ""}`}>
        <div>
          <div className="space-y-2 py-2 pl-7">
            {loading && eventIds.length === 0 ? (
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                <TraceLoader size={12} showLabel={false} />
                Loading intermediate events...
              </div>
            ) : error ? (
              <div className="px-2 py-1 text-xs text-destructive">{error}</div>
            ) : (
              nodes.map((node) => (
                <SessionNodeRenderer
                  key={node.kind === "readglob-group" ? `rg:${node.items[0].id}` : node.id}
                  node={node}
                  gitCheckpointsByPromptEventId={gitCheckpointsByPromptEventId}
                  completedAgentTools={completedAgentTools}
                  toolResultByUseId={toolResultByUseId}
                />
              ))
            )}

            {hasMore && !loading && !error ? (
              <button
                type="button"
                className="ml-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
                onClick={() => void fetchNext()}
              >
                Load more
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
