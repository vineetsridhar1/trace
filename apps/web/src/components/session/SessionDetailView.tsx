import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import { useEntityStore, useEntityField } from "../../stores/entity";
import { SessionMessageList } from "./SessionMessageList";
import { SessionHeader } from "./SessionHeader";
import { SessionInput } from "./SessionInput";
import { PlanResponseBar } from "./PlanResponseBar";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { TerminalPanel } from "./TerminalPanel";
import { buildSessionNodes } from "./groupReadGlob";
import { client } from "../../lib/urql";
import { TERMINATE_SESSION_MUTATION, SEND_SESSION_MESSAGE_MUTATION } from "../../lib/mutations";

const SESSION_DETAIL_QUERY = gql`
  query SessionDetail($id: ID!) {
    session(id: $id) {
      id
      name
      status
      tool
      model
      hosting
      repo {
        id
        name
      }
      branch
      workdir
      prUrl
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
      }
      createdBy {
        id
        name
        avatarUrl
      }
      channel {
        id
      }
      parentSession {
        id
        name
        status
      }
      childSessions {
        id
        name
        status
      }
      createdAt
      updatedAt
    }
  }
`;

export function SessionDetailView({ sessionId }: { sessionId: string }) {
  const { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents } =
    useSessionEvents(sessionId);
  const events = useEntityStore((s) => s.events);
  const status = useEntityField("sessions", sessionId, "status") as string | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const isCloud = hosting === "cloud";

  // Fetch full session with lineage data — merge to avoid wiping fields set by events
  useEffect(() => {
    client
      .query(SESSION_DETAIL_QUERY, { id: sessionId })
      .toPromise()
      .then((result) => {
        if (result.data?.session) {
          const { upsert, sessions } = useEntityStore.getState();
          const existing = sessions[sessionId];
          upsert(
            "sessions",
            sessionId,
            existing ? { ...existing, ...result.data.session } : result.data.session,
          );
        }
      });
  }, [sessionId]);

  const nodes = useMemo(() => buildSessionNodes(eventIds, events), [eventIds, events]);

  // Find plan content when server says session needs input
  const activePlan = useMemo(() => {
    if (status !== "needs_input") return null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.kind === "plan-review") return node;
    }
    return null;
  }, [nodes, status]);

  const activeQuestion = useMemo(() => {
    if (status !== "needs_input") return null;
    if (activePlan) return null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.kind === "ask-user-question") return node;
    }
    return null;
  }, [nodes, status, activePlan]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);
  const showQuestion =
    activeQuestion && activeQuestion.id !== dismissedQuestionId ? activeQuestion : null;

  const [showTerminal, setShowTerminal] = useState(false);

  const handleStop = useCallback(async () => {
    await client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  const handleDismissPlan = useCallback(async () => {
    await client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SessionHeader
        sessionId={sessionId}
        onStop={handleStop}
        onToggleTerminal={isCloud ? () => setShowTerminal((v) => !v) : undefined}
        terminalOpen={showTerminal}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading events...</p>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center">
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
        </div>

        {showTerminal && isCloud && (
          <TerminalPanel sessionId={sessionId} onClose={() => setShowTerminal(false)} />
        )}
      </div>

      {activePlan ? (
        <PlanResponseBar
          sessionId={sessionId}
          planContent={activePlan.planContent}
          onDismiss={handleDismissPlan}
        />
      ) : showQuestion ? (
        <AskUserQuestionBar
          node={showQuestion}
          onResponse={(text) => {
            client
              .mutation(SEND_SESSION_MESSAGE_MUTATION, {
                sessionId,
                text,
              })
              .toPromise();
          }}
          onDismiss={() => {
            setDismissedQuestionId(showQuestion.id);
            client.mutation(TERMINATE_SESSION_MUTATION, { id: sessionId }).toPromise();
          }}
        />
      ) : (
        <SessionInput sessionId={sessionId} />
      )}
    </div>
  );
}
