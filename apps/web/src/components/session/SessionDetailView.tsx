import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { gql } from "@urql/core";
import type { GitCheckpoint } from "@trace/gql";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import { useEntityStore, useEntityField, useScopedEvents, eventScopeKey, type SessionEntity, type SessionGroupEntity } from "../../stores/entity";
import { EventScopeContext } from "./EventScopeContext";
import { useAuthStore } from "../../stores/auth";
import { SessionMessageList } from "./SessionMessageList";
import { SessionHeader } from "./SessionHeader";
import { SessionInput } from "./SessionInput";
import { PlanResponseBar } from "./PlanResponseBar";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { TerminalPanel } from "./TerminalPanel";
import { useUIStore, type UIState } from "../../stores/ui";
import { Loader2, AlertCircle } from "lucide-react";
import { StickyTodoList, extractLatestTodos } from "./StickyTodoList";
import { buildSessionNodes } from "./groupReadGlob";
import { isTerminalStatus } from "./sessionStatus";
import { Skeleton } from "../ui/skeleton";
import { client } from "../../lib/urql";
import {
  DISMISS_SESSION_MUTATION,
  RETRY_SESSION_GROUP_SETUP_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
} from "../../lib/mutations";

const SESSION_DETAIL_QUERY = gql`
  query SessionDetail($id: ID!) {
    session(id: $id) {
      id
      name
      agentStatus
      sessionStatus
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
      sessionGroupId
      sessionGroup {
        id
        name
        branch
        prUrl
        workdir
        worktreeDeleted
        gitCheckpoints {
          id
          sessionId
          promptEventId
          commitSha
          subject
          author
          committedAt
          filesChanged
          createdAt
        }
        channel {
          id
        }
        repo {
          id
          name
        }
        connection {
          state
          runtimeInstanceId
          runtimeLabel
          lastError
          retryCount
          canRetry
          canMove
        }
        createdAt
        updatedAt
        setupStatus
        setupError
      }
      gitCheckpoints {
        id
        sessionId
        promptEventId
        commitSha
        subject
        author
        committedAt
        filesChanged
        createdAt
      }
      channel {
        id
      }
      createdAt
      updatedAt
    }
  }
`;

export function SessionDetailView({
  sessionId,
  panelMode,
  hideHeader,
  scrollToEventId,
  onScrollComplete,
}: {
  key?: React.Key;
  sessionId: string;
  panelMode?: boolean;
  hideHeader?: boolean;
  scrollToEventId?: string | null;
  onScrollComplete?: () => void;
}) {
  const { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents } =
    useSessionEvents(sessionId);
  const scopeKey = eventScopeKey("session", sessionId);
  const events = useScopedEvents(scopeKey);
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as string | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const createdBy = useEntityField("sessions", sessionId, "createdBy") as { id: string } | undefined;
  const gitCheckpoints = useEntityField("sessions", sessionId, "gitCheckpoints") as
    | GitCheckpoint[]
    | undefined;
  const currentUserId = useAuthStore((s: { user: { id: string } | null }) => s.user?.id);
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as boolean | undefined;
  const isCloud = hosting === "cloud";
  const isLocalOwner = hosting === "local" && createdBy?.id === currentUserId;
  const isConnected = !connection || connection.state !== "disconnected";
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as string | undefined;
  const setupStatus = useEntityField("sessionGroups", sessionGroupId ?? "", "setupStatus") as
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | undefined;
  const setupError = useEntityField("sessionGroups", sessionGroupId ?? "", "setupError") as string | undefined;
  const sessionGroupChannel = useEntityField("sessionGroups", sessionGroupId ?? "", "channel") as
    | { id: string }
    | null
    | undefined;
  const rawGroupChannelId = useEntityStore((s) =>
    sessionGroupId
      ? (s.sessionGroups[sessionGroupId] as { channelId?: string | null } | undefined)?.channelId ?? null
      : null,
  );
  const sessionChannel = useEntityField("sessions", sessionId, "channel") as
    | { id: string }
    | null
    | undefined;
  const rawSessionChannelId = useEntityStore((s) =>
    (s.sessions[sessionId] as { channelId?: string | null } | undefined)?.channelId ?? null,
  );
  const channelId = sessionGroupChannel?.id ?? rawGroupChannelId ?? sessionChannel?.id ?? rawSessionChannelId ?? null;
  const channelSetupScript = useEntityField("channels", channelId ?? "", "setupScript") as string | null | undefined;
  const hasSetupScript = Boolean(channelSetupScript?.trim());
  const setupBlocking = hasSetupScript && setupStatus === "running";

  const showTerminalPanel = useUIStore((s: UIState) => s.showTerminalPanel);
  const setShowTerminalPanel = useUIStore((s: UIState) => s.setShowTerminalPanel);
  const [retryingSetup, setRetryingSetup] = useState(false);

  // Reset terminal panel when switching sessions
  useEffect(() => {
    setShowTerminalPanel(false);
  }, [sessionId, setShowTerminalPanel]);

  const canAccessTerminal = (isCloud || isLocalOwner) && isConnected && !isTerminalStatus(agentStatus, sessionStatus) && !worktreeDeleted && !setupBlocking;

  // Fetch full session detail — merge to avoid wiping fields set by events
  useEffect(() => {
    client
      .query(SESSION_DETAIL_QUERY, { id: sessionId })
      .toPromise()
      .then((result: { data?: Record<string, unknown> }) => {
        if (result.data?.session) {
          const { upsert, sessions } = useEntityStore.getState();
          const existing = sessions[sessionId];
          const fetchedSession = result.data.session as SessionEntity;
          const sessionGroup = (fetchedSession as Record<string, unknown>).sessionGroup as SessionGroupEntity | undefined;
          if (sessionGroup?.id) {
            const existingGroup = useEntityStore.getState().sessionGroups[sessionGroup.id];
            upsert(
              "sessionGroups",
              sessionGroup.id,
              existingGroup ? { ...existingGroup, ...sessionGroup } : sessionGroup,
            );
          }
          const merged = existing ? { ...existing, ...fetchedSession } : fetchedSession;
          upsert("sessions", sessionId, merged);

          // If _lastUserMessageAt wasn't set yet (e.g. events arrived before session detail),
          // derive it from already-fetched scoped events
          if (!merged._lastUserMessageAt) {
            const scopeKey = eventScopeKey("session", sessionId);
            const bucket = useEntityStore.getState().eventsByScope[scopeKey];
            if (bucket) {
              const scopedEvents = Object.values(bucket);
              scopedEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
              for (let i = scopedEvents.length - 1; i >= 0; i--) {
                const ev = scopedEvents[i];
                if (ev.eventType === "message_sent" && ev.actor?.type === "user") {
                  const current = useEntityStore.getState().sessions[sessionId];
                  if (current) {
                    upsert("sessions", sessionId, { ...current, _lastUserMessageAt: ev.timestamp });
                  }
                  break;
                }
              }
            }
          }
        }
      });
  }, [sessionId]);

  const { nodes, completedAgentTools } = useMemo(
    () => buildSessionNodes(eventIds, events),
    [eventIds, events],
  );

  // Find plan content when server says session needs input
  const activePlan = useMemo(() => {
    if (sessionStatus !== "needs_input") return null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.kind === "plan-review") return { node, index: i };
    }
    return null;
  }, [nodes, sessionStatus]);

  const activeQuestion = useMemo(() => {
    if (sessionStatus !== "needs_input") return null;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.kind === "ask-user-question") return { node, index: i };
    }
    return null;
  }, [nodes, sessionStatus]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(null);
  // Don't show a stale question if a more recent plan exists — the question was already answered
  const showQuestion = (() => {
    if (!activeQuestion) return null;
    if (activeQuestion.node.id === dismissedQuestionId) return null;
    if (activePlan && activePlan.index > activeQuestion.index) return null;
    return activeQuestion.node;
  })();

  const latestTodos = useMemo(
    () => (agentStatus && !isTerminalStatus(agentStatus, sessionStatus) ? extractLatestTodos(eventIds, events) : null),
    [eventIds, events, agentStatus, sessionStatus],
  );

  const [showTerminal, setShowTerminal] = useState(false);

  // Auto-close terminal when session enters a terminal state or worktree is deleted
  useEffect(() => {
    if ((isTerminalStatus(agentStatus, sessionStatus) || worktreeDeleted) && showTerminal) {
      setShowTerminal(false);
    }
  }, [agentStatus, sessionStatus, worktreeDeleted, showTerminal]);

  const handleStop = useCallback(async () => {
    await client.mutation(DISMISS_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  const handleDismissPlan = useCallback(async () => {
    await client.mutation(DISMISS_SESSION_MUTATION, { id: sessionId }).toPromise();
  }, [sessionId]);

  return (
    <EventScopeContext.Provider value={scopeKey}>
      <div className="flex h-full flex-col overflow-hidden">
        {!hideHeader && (
          <SessionHeader
            sessionId={sessionId}
            onToggleTerminal={canAccessTerminal ? () => setShowTerminal((v: boolean) => !v) : undefined}
            terminalOpen={showTerminal}
            panelMode={panelMode}
          />
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="relative flex-1 overflow-hidden">
            {error ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-destructive">Failed to load events</p>
              </div>
            ) : (
              <SessionMessageList
                key={sessionId}
                nodes={nodes}
                gitCheckpoints={gitCheckpoints ?? []}
                hasOlder={hasOlder}
                loadingOlder={loadingOlder}
                onLoadOlder={fetchOlderEvents}
                completedAgentTools={completedAgentTools}
                scrollToEventId={scrollToEventId}
                onScrollComplete={onScrollComplete}
              />
            )}
            <AnimatePresence>
              {loading && (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="absolute inset-0 bg-background pointer-events-none"
                >
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!hideHeader && setupBlocking && (
            <div className="flex items-center gap-2 border-t border-border bg-surface-deep px-4 py-2">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Setting up environment...</span>
            </div>
          )}

          {!hideHeader && !setupBlocking && setupStatus === "failed" && (
            <div className="flex items-center gap-2 border-t border-border bg-destructive/10 px-4 py-2">
              <AlertCircle size={14} className="text-destructive" />
              <span className="text-xs text-destructive">Setup failed{setupError ? `: ${setupError}` : ""}</span>
              <button
                type="button"
                disabled={!sessionGroupId || retryingSetup}
                className="ml-2 text-xs text-foreground underline"
                onClick={() => {
                  if (!sessionGroupId) return;
                  setRetryingSetup(true);
                  client
                    .mutation(RETRY_SESSION_GROUP_SETUP_MUTATION, { id: sessionGroupId })
                    .toPromise()
                    .finally(() => setRetryingSetup(false));
                }}
              >
                {retryingSetup ? "Retrying..." : "Retry"}
              </button>
            </div>
          )}

          {!hideHeader && (showTerminal || showTerminalPanel) && canAccessTerminal && (
            <TerminalPanel sessionId={sessionId} onClose={() => { setShowTerminal(false); setShowTerminalPanel(false); }} />
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
            {agentStatus === "active" && latestTodos && (
              <StickyTodoList todos={latestTodos} />
            )}
            <SessionInput sessionId={sessionId} onStop={handleStop} />
          </>
        )}
      </div>
    </EventScopeContext.Provider>
  );
}
