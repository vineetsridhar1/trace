import { useCallback, useEffect, useMemo } from "react";
import { gql } from "@urql/core";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import { useEntityStore, useEntityField } from "../../stores/entity";
import { SessionMessageList } from "./SessionMessageList";
import { SessionHeader } from "./SessionHeader";
import { SessionInput } from "./SessionInput";
import { PlanResponseBar } from "./PlanResponseBar";
import { buildSessionNodes } from "./groupReadGlob";
import { isDisconnected } from "./sessionStatus";
import { client } from "../../lib/urql";
import { TERMINATE_SESSION_MUTATION } from "../../lib/mutations";

const SESSION_DETAIL_QUERY = gql`
  query SessionDetail($id: ID!) {
    session(id: $id) {
      id
      name
      status
      tool
      model
      hosting
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
      }
      createdBy { id name avatarUrl }
      channel { id }
      parentSession { id name status }
      childSessions { id name status }
      createdAt
      updatedAt
    }
  }
`;

export function SessionDetailView({ sessionId }: { sessionId: string }) {
  const { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents } = useSessionEvents(sessionId);
  const events = useEntityStore((s) => s.events);
  const status = useEntityField("sessions", sessionId, "status") as string | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as Record<string, unknown> | null | undefined;

  // Fetch full session with lineage data
  useEffect(() => {
    client.query(SESSION_DETAIL_QUERY, { id: sessionId }).toPromise().then((result) => {
      if (result.data?.session) {
        useEntityStore.getState().upsert("sessions", sessionId, result.data.session);
      }
    });
  }, [sessionId]);

  const nodes = useMemo(
    () => buildSessionNodes(eventIds, events),
    [eventIds, events],
  );

  // Find plan content when server says session needs input
  // Don't show plan bar if connection is lost — show recovery panel instead
  const disconnected = isDisconnected(connection);
  const activePlan = useMemo(() => {
    if (status !== "needs_input" || disconnected) return null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.kind === "plan-review") return node;
    }
    return null;
  }, [nodes, status, disconnected]);

  const handleStop = useCallback(async () => {
    await client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  const handleDismissPlan = useCallback(async () => {
    await client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SessionHeader sessionId={sessionId} onStop={handleStop} />

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading events...</p>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-destructive">Failed to load events</p>
        </div>
      ) : (
        <SessionMessageList
          nodes={nodes}
          hasOlder={hasOlder}
          loadingOlder={loadingOlder}
          onLoadOlder={fetchOlderEvents}
        />
      )}

      {activePlan ? (
        <PlanResponseBar
          sessionId={sessionId}
          planContent={activePlan.planContent}
          onDismiss={handleDismissPlan}
        />
      ) : (
        <SessionInput sessionId={sessionId} />
      )}
    </div>
  );
}
