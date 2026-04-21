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
import type { GitCheckpoint } from "@trace/gql";

export interface UseSessionNodesResult {
  nodes: SessionNode[];
  completedAgentTools: Map<string, AgentToolResult>;
  toolResultByUseId: Map<string, unknown>;
  /** Checkpoints bucketed by the user-prompt event that produced them. */
  gitCheckpointsByPromptEventId: Map<string, GitCheckpoint[]>;
}

/**
 * Derive the renderable SessionNode[] for a session from its scoped events,
 * identical to web's node model. Also exposes the two tool-output maps the
 * builder produces plus a per-prompt git-checkpoint index — renderers need
 * these to inline tool_result content and to show checkpoint markers under
 * the prompts that triggered them.
 */
export function useSessionNodes(sessionId: string): UseSessionNodesResult {
  const scopeKey = eventScopeKey("session", sessionId);
  const eventIds = useScopedEventIds(scopeKey, (a, b) => a.timestamp.localeCompare(b.timestamp));
  const events = useScopedEvents(scopeKey);
  const gitCheckpoints = useEntityField("sessions", sessionId, "gitCheckpoints") as
    | GitCheckpoint[]
    | undefined;

  const { nodes, completedAgentTools, toolResultByUseId } = useMemo(
    () => buildSessionNodes(eventIds, events),
    [eventIds, events],
  );

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

  return { nodes, completedAgentTools, toolResultByUseId, gitCheckpointsByPromptEventId };
}
