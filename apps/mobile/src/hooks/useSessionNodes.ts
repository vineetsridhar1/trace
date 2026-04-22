import { useMemo } from "react";
import {
  buildSessionNodes,
  eventScopeKey,
  useEntityField,
  useScopedEventIds,
  useScopedEvents,
  type AgentToolResult,
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

function sortEventsByTimestamp(a: Event, b: Event): number {
  return a.timestamp.localeCompare(b.timestamp);
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
export function useSessionNodes(sessionId: string): UseSessionNodesResult {
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, sortEventsByTimestamp);
  const events = useScopedEvents(scopeKey);
  const gitCheckpoints = useEntityField("sessions", sessionId, "gitCheckpoints") as
    | GitCheckpoint[]
    | undefined;

  const { nodes, completedAgentTools, toolResultByUseId } = useMemo(() => {
    const built = buildSessionNodes(eventIds, events);
    return {
      ...built,
      nodes: built.nodes.filter((node) =>
        node.kind !== "event" ? true : willEventRender(events[node.id]),
      ),
    };
  }, [eventIds, events]);

  const gitCheckpointsByPromptEventId = useMemo(() => {
    const map = new Map<string, GitCheckpoint[]>();
    for (const checkpoint of gitCheckpoints ?? []) {
      const pid = checkpoint.promptEventId;
      if (!pid) continue;
      const list = map.get(pid) ?? [];
      list.push(checkpoint);
      map.set(pid, list);
    }
    return map;
  }, [gitCheckpoints]);

  return { nodes, completedAgentTools, toolResultByUseId, gitCheckpointsByPromptEventId, events };
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
      return type === "assistant" || type === "user" || type === "result" || type === "error";
    }
    default:
      return false;
  }
}
