import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import type { GitCheckpoint, QueuedMessage } from "@trace/gql";
import { toast } from "sonner";
import { useSessionEvents } from "../../hooks/useSessionEvents";
import {
  useEntityStore,
  useEntityField,
  useScopedEvents,
  eventScopeKey,
  type SessionEntity,
  type SessionGroupEntity,
} from "@trace/client-core";
import { EventScopeContext } from "./EventScopeContext";
import { SessionMessageList } from "./SessionMessageList";
import { SessionHeader } from "./SessionHeader";
import { SessionInput } from "./SessionInput";
import { PlanResponseBar } from "./PlanResponseBar";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { TerminalPanel } from "./TerminalPanel";
import { BridgeAccessNotice } from "./BridgeAccessNotice";
import { isBridgeInteractionAllowed, useBridgeRuntimeAccess } from "./useBridgeRuntimeAccess";
import { useUIStore, type UIState } from "../../stores/ui";
import { Loader2, AlertCircle, Cloud, RefreshCw, ArrowRightLeft } from "lucide-react";
import { StickyTodoList, extractLatestTodos } from "./StickyTodoList";
import { buildSessionNodes } from "./groupReadGlob";
import { isTerminalStatus } from "./sessionStatus";
import { QueuedMessagesList } from "./QueuedMessagesList";
import { Skeleton } from "../ui/skeleton";
import { SessionRuntimePicker } from "./SessionRuntimePicker";
import { client } from "../../lib/urql";
import {
  DISMISS_SESSION_MUTATION,
  MOVE_SESSION_TO_CLOUD_MUTATION,
  RETRY_SESSION_CONNECTION_MUTATION,
  RETRY_SESSION_GROUP_SETUP_MUTATION,
  SEND_SESSION_MESSAGE_MUTATION,
} from "@trace/client-core";
import { getLinkedCheckoutRuntimeInstanceId } from "../../lib/linked-checkout-access";

const RUNTIME_BOOTING_STATES = new Set([
  "pending",
  "requested",
  "provisioning",
  "booting",
  "connecting",
]);
const RUNTIME_FAILURE_STATES = new Set(["failed", "timed_out", "deprovision_failed"]);

function getConnectionState(connection: Record<string, unknown> | null | undefined): string | null {
  const state = connection?.state;
  return typeof state === "string" ? state : null;
}

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
      lastUserMessageAt
      lastMessageAt
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
        autoRetryable
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
          autoRetryable
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
      queuedMessages {
        id
        sessionId
        text
        imageKeys
        interactionMode
        position
        createdAt
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
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic") as boolean | undefined;
  const { eventIds, loading, loadingOlder, hasOlder, error, fetchOlderEvents } = useSessionEvents(
    sessionId,
    { skip: isOptimistic === true },
  );
  const scopeKey = eventScopeKey("session", sessionId);
  const events = useScopedEvents(scopeKey);
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | string
    | undefined;
  const gitCheckpoints = useEntityField("sessions", sessionId, "gitCheckpoints") as
    | GitCheckpoint[]
    | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as
    | boolean
    | undefined;
  const isConnected = !connection || connection.state !== "disconnected";
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const groupConnection = useEntityField("sessionGroups", sessionGroupId ?? "", "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const sessionRuntimeInstanceId = getLinkedCheckoutRuntimeInstanceId(connection);
  const groupRuntimeInstanceId = getLinkedCheckoutRuntimeInstanceId(groupConnection);
  const runtimeInstanceId =
    hosting === "cloud"
      ? sessionRuntimeInstanceId
      : groupRuntimeInstanceId ?? sessionRuntimeInstanceId;
  const { access: bridgeAccess, refresh: refreshBridgeAccess } = useBridgeRuntimeAccess(
    runtimeInstanceId,
    sessionGroupId ?? null,
  );
  const bridgeInteractionAllowed =
    hosting === "cloud" || isBridgeInteractionAllowed(bridgeAccess);
  const setupStatus = useEntityField("sessionGroups", sessionGroupId ?? "", "setupStatus") as
    | "idle"
    | "running"
    | "completed"
    | "failed"
    | undefined;
  const setupError = useEntityField("sessionGroups", sessionGroupId ?? "", "setupError") as
    | string
    | undefined;
  const sessionGroupChannel = useEntityField("sessionGroups", sessionGroupId ?? "", "channel") as
    | { id: string }
    | null
    | undefined;
  const rawGroupChannelId = useEntityStore((s) =>
    sessionGroupId
      ? ((s.sessionGroups[sessionGroupId] as { channelId?: string | null } | undefined)
          ?.channelId ?? null)
      : null,
  );
  const sessionChannel = useEntityField("sessions", sessionId, "channel") as
    | { id: string }
    | null
    | undefined;
  const rawSessionChannelId = useEntityStore(
    (s) => (s.sessions[sessionId] as { channelId?: string | null } | undefined)?.channelId ?? null,
  );
  const channelId =
    sessionGroupChannel?.id ??
    rawGroupChannelId ??
    sessionChannel?.id ??
    rawSessionChannelId ??
    null;
  const channelSetupScript = useEntityField("channels", channelId ?? "", "setupScript") as
    | string
    | null
    | undefined;
  const hasSetupScript = Boolean(channelSetupScript?.trim());
  const setupBlocking = hasSetupScript && setupStatus === "running";

  const showTerminalPanel = useUIStore((s: UIState) => s.showTerminalPanel);
  const setShowTerminalPanel = useUIStore((s: UIState) => s.setShowTerminalPanel);
  const [retryingSetup, setRetryingSetup] = useState(false);

  // Reset terminal panel when switching sessions
  useEffect(() => {
    setShowTerminalPanel(false);
  }, [sessionId, setShowTerminalPanel]);

  const canAccessTerminal =
    bridgeInteractionAllowed &&
    isConnected &&
    !isTerminalStatus(agentStatus, sessionStatus) &&
    !worktreeDeleted &&
    !setupBlocking;

  // Fetch full session detail — merge to avoid wiping fields set by events
  useEffect(() => {
    if (isOptimistic) return;
    client
      .query(SESSION_DETAIL_QUERY, { id: sessionId })
      .toPromise()
      .then((result: { data?: Record<string, unknown> }) => {
        if (result.data?.session) {
          const state = useEntityStore.getState();
          const fetchedSession = result.data.session as SessionEntity;
          const existing = state.sessions[sessionId];
          const update: Record<string, unknown> = {};

          // Session group
          const sessionGroup = (fetchedSession as Record<string, unknown>).sessionGroup as
            | SessionGroupEntity
            | undefined;
          if (sessionGroup?.id) {
            const existingGroup = state.sessionGroups[sessionGroup.id];
            update.sessionGroups = {
              ...state.sessionGroups,
              [sessionGroup.id]: existingGroup
                ? { ...existingGroup, ...sessionGroup }
                : sessionGroup,
            };
          }

          // Session
          update.sessions = {
            ...state.sessions,
            [sessionId]: existing ? { ...existing, ...fetchedSession } : fetchedSession,
          };

          // Queued messages
          const queuedMessages = (fetchedSession as Record<string, unknown>).queuedMessages as
            | Array<{
                id: string;
                sessionId: string;
                text: string;
                imageKeys: string[];
                interactionMode?: string;
                position: number;
                createdAt: string;
              }>
            | undefined;
          if (queuedMessages && queuedMessages.length > 0) {
            const qmTable = { ...state.queuedMessages };
            const idx = { ...state._queuedMessageIdsBySession };
            const ids: string[] = [];
            for (const qm of queuedMessages) {
              qmTable[qm.id] = qm as unknown as QueuedMessage;
              ids.push(qm.id);
            }
            idx[sessionId] = ids;
            update.queuedMessages = qmTable;
            update._queuedMessageIdsBySession = idx;
          }

          useEntityStore.setState(update);
        }
      });
  }, [sessionId, isOptimistic]);

  const { nodes, completedAgentTools, toolResultByUseId } = useMemo(
    () => buildSessionNodes(eventIds, events),
    [eventIds, events],
  );
  const initialEventsLoading = loading && eventIds.length === 0;
  const connectionState = getConnectionState(connection);
  const groupConnectionState = getConnectionState(groupConnection);
  const groupRuntimeConnected = groupConnectionState === "connected";
  const suppressSharedCloudStartupNotice =
    groupRuntimeConnected &&
    connectionState !== null &&
    RUNTIME_BOOTING_STATES.has(connectionState);
  const runtimeLifecycleState =
    hosting === "cloud" &&
    connectionState !== null &&
    connectionState !== "connected" &&
    !suppressSharedCloudStartupNotice &&
    (RUNTIME_BOOTING_STATES.has(connectionState) || RUNTIME_FAILURE_STATES.has(connectionState))
      ? connectionState
      : null;

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
    () =>
      agentStatus && !isTerminalStatus(agentStatus, sessionStatus)
        ? extractLatestTodos(eventIds, events)
        : null,
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
            onToggleTerminal={
              canAccessTerminal ? () => setShowTerminal((v: boolean) => !v) : undefined
            }
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
                initialLoading={initialEventsLoading}
                hasOlder={hasOlder}
                loadingOlder={loadingOlder}
                onLoadOlder={fetchOlderEvents}
                completedAgentTools={completedAgentTools}
                toolResultByUseId={toolResultByUseId}
                scrollToEventId={scrollToEventId}
                onScrollComplete={onScrollComplete}
              />
            )}
            {initialEventsLoading && (
              <div className="absolute inset-0 bg-background pointer-events-none">
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
              </div>
            )}
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
              <span className="text-xs text-destructive">
                Setup failed{setupError ? `: ${setupError}` : ""}
              </span>
              <button
                type="button"
                disabled={!sessionGroupId || retryingSetup || !bridgeInteractionAllowed}
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
            <TerminalPanel
              sessionId={sessionId}
              onClose={() => {
                setShowTerminal(false);
                setShowTerminalPanel(false);
              }}
            />
          )}
        </div>

        {runtimeLifecycleState ? (
          <RuntimeLifecycleNotice
            sessionId={sessionId}
            connection={connection}
            connectionState={runtimeLifecycleState}
          />
        ) : !bridgeInteractionAllowed ? (
          <div className="border-t p-4">
            <BridgeAccessNotice
              access={bridgeAccess}
              sessionGroupId={sessionGroupId ?? null}
              onRequested={refreshBridgeAccess}
            />
          </div>
        ) : showQuestion ? (
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
            {agentStatus === "active" && latestTodos && <StickyTodoList todos={latestTodos} />}
            <QueuedMessagesList sessionId={sessionId} />
            <SessionInput
              sessionId={sessionId}
              onStop={handleStop}
              bridgeAccess={bridgeAccess}
              sessionGroupId={sessionGroupId ?? null}
              onAccessRequested={refreshBridgeAccess}
            />
          </>
        )}
      </div>
    </EventScopeContext.Provider>
  );
}

function RuntimeLifecycleNotice({
  sessionId,
  connection,
  connectionState,
}: {
  sessionId: string;
  connection: Record<string, unknown> | null | undefined;
  connectionState: string;
}) {
  const [action, setAction] = useState<"retry" | "cloud" | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const failed = RUNTIME_FAILURE_STATES.has(connectionState);
  const providerStatus =
    typeof connection?.providerStatus === "string" ? connection.providerStatus : null;
  const label = failed
    ? connectionState === "timed_out"
      ? "Cloud runtime timed out"
      : "Cloud runtime failed"
    : connectionState === "requested"
      ? "Cloud recovery requested"
    : connectionState === "provisioning"
      ? providerStatus === "booting"
        ? "Cloud runtime booting"
        : "Cloud runtime provisioning"
      : connectionState === "connecting"
        ? "Waiting for cloud bridge"
        : "Starting cloud runtime";
  const body = failed
    ? "Trace could not finish starting the cloud runtime."
    : connectionState === "requested"
      ? "Trace sent the recovery request and is waiting for the provider to report progress."
      : connectionState === "connecting"
        ? "The provider accepted the runtime request. Trace is waiting for the bridge to connect."
        : "Your message is queued while Trace waits for the runtime provider.";
  const bannerTone = failed
    ? "border-destructive/30 bg-destructive/5"
    : "border-yellow-500/30 bg-yellow-500/5";
  const iconTone = failed ? "text-destructive" : "text-yellow-500";

  const handleRetry = useCallback(async () => {
    setAction("retry");
    try {
      const result = await client
        .mutation(RETRY_SESSION_CONNECTION_MUTATION, { sessionId })
        .toPromise();
      if (result.error) {
        toast.error("Failed to retry cloud runtime", { description: result.error.message });
      }
    } finally {
      setAction(null);
    }
  }, [sessionId]);

  const handleNewCloud = useCallback(async () => {
    setAction("cloud");
    try {
      const result = await client
        .mutation(MOVE_SESSION_TO_CLOUD_MUTATION, { sessionId })
        .toPromise();
      if (result.error) {
        toast.error("Failed to start cloud runtime", { description: result.error.message });
      }
    } finally {
      setAction(null);
    }
  }, [sessionId]);

  return (
    <div className="shrink-0 border-t border-border px-4 py-3">
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${bannerTone}`}
      >
        {failed ? (
          <AlertCircle size={16} className={`shrink-0 ${iconTone}`} />
        ) : (
          <Cloud size={16} className={`shrink-0 ${iconTone}`} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{body}</p>
        </div>
        {failed && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={action !== null}
              onClick={handleRetry}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={action === "retry" ? "animate-spin" : ""} />
              Retry
            </button>
            <button
              type="button"
              disabled={action !== null}
              onClick={() => setShowPicker((open) => !open)}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              <ArrowRightLeft size={12} />
              Move
            </button>
            <button
              type="button"
              disabled={action !== null}
              onClick={handleNewCloud}
              className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              {action === "cloud" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Cloud size={12} />
              )}
              New cloud container
            </button>
          </div>
        )}
      </div>
      {failed && showPicker && (
        <SessionRuntimePicker sessionId={sessionId} onClose={() => setShowPicker(false)} />
      )}
    </div>
  );
}
