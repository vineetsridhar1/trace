import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import { useEntityStore, useEntityField, useScopedEvents, eventScopeKey } from "../../stores/entity";
import { EventScopeContext } from "./EventScopeContext";
import { useAuthStore } from "../../stores/auth";
import { SessionMessageList } from "./SessionMessageList";
import { SessionHeader } from "./SessionHeader";
import { SessionInput } from "./SessionInput";
import { PlanResponseBar } from "./PlanResponseBar";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { TerminalPanel } from "./TerminalPanel";
import { StickyTodoList, extractLatestTodos } from "./StickyTodoList";
import { buildSessionNodes } from "./groupReadGlob";
import { isTerminalStatus } from "./sessionStatus";
import { Skeleton } from "../ui/skeleton";
import { client } from "../../lib/urql";
import { DISMISS_SESSION_MUTATION, SEND_SESSION_MESSAGE_MUTATION } from "../../lib/mutations";

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
      worktreeDeleted
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
  const scopeKey = eventScopeKey("session", sessionId);
  const events = useScopedEvents(scopeKey);
  const status = useEntityField("sessions", sessionId, "status") as string | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const createdBy = useEntityField("sessions", sessionId, "createdBy") as { id: string } | undefined;
  const currentUserId = useAuthStore((s) => s.user?.id);
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as boolean | undefined;
  const isCloud = hosting === "cloud";
  const isLocalOwner = hosting === "local" && createdBy?.id === currentUserId;
  const isConnected = !connection || connection.state !== "disconnected";
  const canAccessTerminal = (isCloud || isLocalOwner) && isConnected && !isTerminalStatus(status) && !worktreeDeleted;

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

  const { nodes, completedAgentTools } = useMemo(
    () => buildSessionNodes(eventIds, events),
    [eventIds, events],
  );

  // Find plan content when server says session needs input
  const activePlan = useMemo(() => {
    if (status !== "needs_input") return null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.kind === "plan-review") return { node, index: i };
    }
    return null;
  }, [nodes, status]);

  const activeQuestion = useMemo(() => {
    if (status !== "needs_input") return null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.kind === "ask-user-question") return { node, index: i };
    }
    return null;
  }, [nodes, status]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);
  // Don't show a stale question if a more recent plan exists — the question was already answered
  const showQuestion = (() => {
    if (!activeQuestion) return null;
    if (activeQuestion.node.id === dismissedQuestionId) return null;
    if (activePlan && activePlan.index > activeQuestion.index) return null;
    return activeQuestion.node;
  })();

  const latestTodos = useMemo(
    () => (status && !isTerminalStatus(status) ? extractLatestTodos(eventIds, events) : null),
    [eventIds, events, status],
  );

  const [showTerminal, setShowTerminal] = useState(false);

  // Auto-close terminal when session enters a terminal state or worktree is deleted
  useEffect(() => {
    if ((isTerminalStatus(status) || worktreeDeleted) && showTerminal) {
      setShowTerminal(false);
    }
  }, [status, worktreeDeleted, showTerminal]);

  const handleStop = useCallback(async () => {
    await client.mutation(DISMISS_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  const handleDismissPlan = useCallback(async () => {
    await client.mutation(DISMISS_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  return (
    <EventScopeContext.Provider value={scopeKey}>
      <div className="flex h-full flex-col overflow-hidden">
        <SessionHeader
          sessionId={sessionId}
          onStop={handleStop}
          onToggleTerminal={canAccessTerminal ? () => setShowTerminal((v) => !v) : undefined}
          terminalOpen={showTerminal}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {loading ? (
              <div className="flex flex-col gap-4 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3.5 w-[80%]" />
                      <Skeleton className="h-3.5 w-[60%]" />
                    </div>
                  </div>
                ))}
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
                completedAgentTools={completedAgentTools}
              />
            )}
          </div>

          {showTerminal && canAccessTerminal && (
            <TerminalPanel sessionId={sessionId} onClose={() => setShowTerminal(false)} />
          )}
        </div>

        {showQuestion ? (
          <AskUserQuestionBar
            node={showQuestion}
            onResponse={(text) => {
              client
                .mutation(SEND_SESSION_MESSAGE_MUTATION, {
                  sessionId,
                  text,
                  interactionMode: activePlan ? "plan" : undefined,
                })
                .toPromise();
            }}
            onDismiss={() => {
              setDismissedQuestionId(showQuestion.id);
            }}
          />
        ) : activePlan ? (
          <PlanResponseBar
            sessionId={sessionId}
            planContent={activePlan.node.planContent}
            onDismiss={handleDismissPlan}
          />
        ) : (
          <>
            {status === "active" && latestTodos && (
              <StickyTodoList todos={latestTodos} />
            )}
            <SessionInput sessionId={sessionId} />
          </>
        )}
      </div>
    </EventScopeContext.Provider>
  );
}
