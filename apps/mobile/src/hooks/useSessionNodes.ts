import { useMemo, useRef } from "react";
import {
  buildSessionNodes,
  eventScopeKey,
  statusRowForSessionOutput,
  statusRowForSessionTermination,
  useEntityStore,
  useEntityField,
  type AgentToolResult,
  type EntityState,
  type SessionNode,
} from "@trace/client-core";
import type { Event, GitCheckpoint } from "@trace/gql";
import { asJsonObject } from "@trace/shared";

export interface UseSessionNodesResult {
  nodes: SessionNode[];
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
  /** Checkpoints bucketed by the user-prompt event that produced them. */
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>;
  /** Scoped events table. Exposed so `getItemType` can segment FlashList recycling pools by eventType. */
  events: Record<string, Event>;
}

interface UseSessionNodesOptions {
  enabled?: boolean;
  frozen?: boolean;
}

const DISABLED_SCOPE_KEY = "__session_nodes_disabled__";
const EMPTY_NODES: SessionNode[] = [];
const EMPTY_COMPLETED_AGENT_TOOLS = new Map<string, AgentToolResult>();
const EMPTY_TOOL_RESULTS = new Map<string, unknown>();
const EMPTY_GIT_CHECKPOINTS = new Map<string, GitCheckpoint[]>();
const EMPTY_EVENTS: Record<string, Event> = {};
const EMPTY_EVENT_IDS: string[] = [];

interface ScopedEventSnapshot {
  scopeKey: string;
  events: Record<string, Event>;
  eventIds: string[];
}

/**
 * Derive the renderable SessionNode[] for a session from its scoped events,
 * identical to web's node model. Also exposes the two tool-output maps the
 * builder produces plus a per-prompt git-checkpoint index — renderers need
 * these to inline tool_result content and to show checkpoint markers under
 * the prompts that triggered them.
 *
 * Event-kind nodes whose `eventType`/`payload.type` combo has no mobile
 * renderer are dropped here rather than reaching FlashList. Returning
 * null from `renderItem` would force FlashList v2 to recycle cells between
 * inconsistent shapes (crash: "Attempt to recycle a mounted view"); the
 * simpler contract is "every node the list sees produces visible output."
 */
export function useSessionNodes(
  sessionId: string,
  options: UseSessionNodesOptions = {},
): UseSessionNodesResult {
  const enabled = options.enabled ?? true;
  const frozen = options.frozen ?? false;
  const scopeKey = enabled ? eventScopeKey("session", sessionId) : DISABLED_SCOPE_KEY;
  const snapshot = useScopedEventSnapshot(scopeKey, frozen);
  const gitCheckpoints = useEntityField("sessions", sessionId, "gitCheckpoints") as
    | GitCheckpoint[]
    | undefined;
  const previousResultRef = useRef<{
    scopeKey: string;
    nodes: SessionNode[];
    completedAgentTools: Map<string, AgentToolResult>;
    toolResultByUseId: Map<string, unknown>;
    events: Record<string, Event>;
  } | null>(null);

  const built = useMemo(() => {
    if (!enabled) {
      const emptyResult = {
        nodes: EMPTY_NODES,
        completedAgentTools: EMPTY_COMPLETED_AGENT_TOOLS,
        toolResultByUseId: EMPTY_TOOL_RESULTS,
        events: EMPTY_EVENTS,
        scopeKey,
      };
      previousResultRef.current = emptyResult;
      return emptyResult;
    }
    if (frozen && previousResultRef.current?.scopeKey === scopeKey) {
      return previousResultRef.current;
    }
    const built = buildSessionNodes(snapshot.eventIds, snapshot.events);
    const nextResult = {
      ...built,
      nodes: built.nodes.filter((node) =>
        node.kind !== "event" ? true : willEventRender(snapshot.events[node.id]),
      ),
      events: snapshot.events,
      scopeKey,
    };
    previousResultRef.current = nextResult;
    return nextResult;
  }, [enabled, frozen, snapshot, scopeKey]);

  const completedAgentTools = useStableMap(built.completedAgentTools, (a, b) =>
    Object.is(a.content, b.content),
  );
  const toolResultByUseId = useStableMap(built.toolResultByUseId);

  const gitCheckpointsByPromptEventId = useMemo(() => {
    if (!enabled) return EMPTY_GIT_CHECKPOINTS;
    const map = new Map<string, GitCheckpoint[]>();
    for (const checkpoint of gitCheckpoints ?? []) {
      const pid = checkpoint.promptEventId;
      if (!pid) continue;
      const list = map.get(pid) ?? [];
      list.push(checkpoint);
      map.set(pid, list);
    }
    return map;
  }, [enabled, gitCheckpoints]);

  return {
    nodes: built.nodes,
    completedAgentTools,
    toolResultByUseId,
    gitCheckpointsByPromptEventId,
    events: built.events,
  };
}

function useScopedEventSnapshot(scopeKey: string, frozen: boolean): ScopedEventSnapshot {
  const snapshotRef = useRef<ScopedEventSnapshot>({
    scopeKey,
    events: EMPTY_EVENTS,
    eventIds: EMPTY_EVENT_IDS,
  });
  const bucketRef = useRef<Record<string, Event> | null>(null);
  const eventIdsRef = useRef<string[]>(EMPTY_EVENT_IDS);

  return useEntityStore((state: EntityState) => {
    const previousSnapshot = snapshotRef.current;
    if (frozen && previousSnapshot.scopeKey === scopeKey) {
      return previousSnapshot;
    }

    const events = state.eventsByScope[scopeKey] ?? EMPTY_EVENTS;
    const eventIds = state._eventIdsByScope[scopeKey] ?? EMPTY_EVENT_IDS;
    if (
      previousSnapshot.scopeKey === scopeKey &&
      bucketRef.current === events &&
      eventIdsRef.current === eventIds
    ) {
      return previousSnapshot;
    }
    const nextSnapshot = { scopeKey, events, eventIds };
    bucketRef.current = events;
    eventIdsRef.current = eventIds;
    snapshotRef.current = nextSnapshot;
    return nextSnapshot;
  });
}

function useStableMap<K, V>(
  next: Map<K, V>,
  valueEqual: (a: V, b: V) => boolean = Object.is,
): Map<K, V> {
  const ref = useRef(next);
  if (!mapsEqual(ref.current, next, valueEqual)) {
    ref.current = next;
  }
  return ref.current;
}

function mapsEqual<K, V>(a: Map<K, V>, b: Map<K, V>, valueEqual: (a: V, b: V) => boolean): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined && !b.has(key)) return false;
    if (!valueEqual(value, other as V)) return false;
  }
  return true;
}

/** Mirror of the mobile dispatcher's renderable event-type / payload-type set. */
function willEventRender(event: Event | undefined): boolean {
  if (!event) return false;
  switch (event.eventType) {
    case "session_started":
    case "message_sent":
    case "session_pr_opened":
    case "session_pr_merged":
    case "session_pr_closed":
      return true;
    case "session_output": {
      const payload = asJsonObject(event.payload);
      if (!payload) return false;
      const type = payload.type;
      return type === "assistant" || type === "user" || !!statusRowForSessionOutput(payload);
    }
    case "session_terminated": {
      const payload = asJsonObject(event.payload);
      return payload ? !!statusRowForSessionTermination(payload) : false;
    }
    default:
      return false;
  }
}
