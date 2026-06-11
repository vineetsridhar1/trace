import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  History,
  WifiOff,
  Monitor,
  Cloud,
  TerminalSquare,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useEntityField } from "@trace/client-core";
import { useUIStore } from "../../stores/ui";
import { useDetailPanelStore } from "../../stores/detail-panel";
import { cn } from "../../lib/utils";
import {
  agentStatusColor,
  getDisplayAgentStatus,
  getDisplaySessionStatus,
  sessionStatusLabel,
  connectionColor,
  connectionLabel,
  isDisconnected,
} from "./sessionStatus";
import { isBridgeInteractionAllowed, useBridgeRuntimeAccess } from "./useBridgeRuntimeAccess";
import { AgentStatusIcon } from "./AgentStatusIcon";
import { SessionHistory } from "./SessionHistory";
import { ScrambleText } from "../ui/ScrambleText";
import { SessionMoveButton } from "./SessionMoveButton";
import { getLinkedCheckoutRuntimeInstanceId } from "../../lib/linked-checkout-access";
import { TraceLoader } from "../ui/trace-loader";
import { GitHubActions } from "./GitHubActions";
import { ActionTooltip } from "../ui/ActionTooltip";
import { SessionUsageBadge } from "./SessionUsageBadge";

/** How long to show "Reconnecting…" before switching to "Connection Lost" */
const CONNECTION_LOST_BANNER_DELAY_MS = 60_000;
const headerIconButtonClass =
  "app-region-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:cursor-default disabled:opacity-40";

export function SessionHeader({
  sessionId,
  onToggleTerminal,
  terminalOpen,
  panelMode,
}: {
  sessionId: string;
  onToggleTerminal?: () => void;
  terminalOpen?: boolean;
  panelMode?: boolean;
}) {
  const name = useEntityField("sessions", sessionId, "name");
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | string
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const groupPrUrl = useEntityField("sessionGroups", sessionGroupId ?? "", "prUrl") as
    | string
    | null
    | undefined;
  const groupArchivedAt = useEntityField("sessionGroups", sessionGroupId ?? "", "archivedAt") as
    | string
    | null
    | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const workdir = useEntityField("sessions", sessionId, "workdir") as string | null | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as
    | boolean
    | undefined;
  const lastUserMessageAt = useEntityField("sessions", sessionId, "lastUserMessageAt") as
    | string
    | null
    | undefined;
  const setActiveSessionId = useUIStore(
    (s: { setActiveSessionId: (id: string | null) => void }) => s.setActiveSessionId,
  );
  const isFullscreen = useDetailPanelStore((s: { isFullscreen: boolean }) => s.isFullscreen);
  const toggleFullscreen = useDetailPanelStore(
    (s: { toggleFullscreen: () => void }) => s.toggleFullscreen,
  );
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const prUrl = groupPrUrl ?? null;

  const disconnected = isDisconnected(connection);
  const moveRuntimeInstanceId = getLinkedCheckoutRuntimeInstanceId(connection);
  const { access: moveBridgeAccess } = useBridgeRuntimeAccess(
    moveRuntimeInstanceId,
    sessionGroupId ?? null,
  );
  const bridgeInteractionAllowed = isBridgeInteractionAllowed(moveBridgeAccess);
  const mergedUnavailable = sessionStatus === "merged" && worktreeDeleted !== false;
  const canMoveSession = !mergedUnavailable && bridgeInteractionAllowed;
  const moveDisabledReason =
    mergedUnavailable
      ? "Cannot move a merged session"
      : !bridgeInteractionAllowed
        ? "You don't have access to this bridge"
        : undefined;

  // Show "Reconnecting" for a grace period before showing "Connection Lost"
  const [pastGracePeriod, setPastGracePeriod] = useState(false);
  useEffect(() => {
    if (!disconnected) {
      setPastGracePeriod(false);
      return;
    }
    const timer = setTimeout(() => setPastGracePeriod(true), CONNECTION_LOST_BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [disconnected]);

  const runtimeLabel = connection?.runtimeLabel as string | undefined;
  const isCloud = hosting === "cloud";
  const runtimeDisplayLabel = isCloud ? "Cloud" : (runtimeLabel ?? null);
  const connectionState = typeof connection?.state === "string" ? connection.state : undefined;
  const runtimeStatusLabel =
    connectionState && connectionState !== "connected" ? connectionLabel[connectionState] : null;
  const runtimeStatusColor =
    connectionState && connectionState !== "connected"
      ? (connectionColor[connectionState] ?? "text-muted-foreground")
      : null;
  const displaySessionStatus = getDisplaySessionStatus(
    sessionStatus,
    prUrl,
    agentStatus,
    groupArchivedAt,
    { workdir, lastUserMessageAt, connection },
  );
  const displayAgentStatus = getDisplayAgentStatus(
    agentStatus,
    sessionStatus,
    prUrl,
    groupArchivedAt,
    { workdir, lastUserMessageAt, connection },
  );

  const closeHistory = useCallback(() => setShowHistory(false), []);

  useEffect(() => {
    if (!showHistory) return;
    function handleClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        closeHistory();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeHistory();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showHistory, closeHistory]);

  return (
    <div className="app-region-drag flex shrink-0 items-center gap-3 border-b border-border bg-surface-mid px-4 py-2">
      {panelMode ? (
        <ActionTooltip label="Close panel">
          <button
            onClick={() => setActiveSessionId(null)}
            className="app-region-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close panel"
          >
            <X size={16} />
          </button>
        </ActionTooltip>
      ) : (
        <ActionTooltip label="Back to sessions">
          <button
            onClick={() => setActiveSessionId(null)}
            className="app-region-no-drag flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to sessions"
          >
            <ArrowLeft size={16} />
          </button>
        </ActionTooltip>
      )}

      {disconnected ? (
        pastGracePeriod ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-destructive">
            <WifiOff size={12} />
            Connection Lost
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-yellow-500">
            <TraceLoader size={12} showLabel={false} />
            Reconnecting…
          </span>
        )
      ) : runtimeStatusLabel ? (
        <span className={`flex shrink-0 items-center gap-1.5 text-xs ${runtimeStatusColor}`}>
          {connectionState === "failed" ||
          connectionState === "timed_out" ||
          connectionState === "deprovision_failed" ? (
            <WifiOff size={12} />
          ) : connectionState === "stopped" || connectionState === "deprovisioned" ? (
            <AgentStatusIcon agentStatus="stopped" size={10} />
          ) : (
            <TraceLoader size={12} showLabel={false} />
          )}
          {runtimeStatusLabel}
        </span>
      ) : (
        <span
          className={`flex shrink-0 items-center gap-1.5 text-xs ${agentStatusColor[displayAgentStatus]}`}
        >
          <AgentStatusIcon agentStatus={displayAgentStatus} size={10} />
          {sessionStatusLabel[displaySessionStatus]}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground truncate">
          <ScrambleText text={name ?? "Session"} />
        </h2>
      </div>

      {runtimeDisplayLabel && (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-xs text-muted-foreground">
          {isCloud ? <Cloud size={12} /> : <Monitor size={12} />}
          {runtimeDisplayLabel}
        </span>
      )}

      <SessionUsageBadge sessionId={sessionId} />

      <div className="flex shrink-0 items-center gap-1">
        {panelMode && (
          <ActionTooltip label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <button
              onClick={toggleFullscreen}
              className={headerIconButtonClass}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </ActionTooltip>
        )}

        {onToggleTerminal && (
          <ActionTooltip label={terminalOpen ? "Hide terminal" : "Show terminal"}>
            <button
              onClick={onToggleTerminal}
              className={cn(
                headerIconButtonClass,
                terminalOpen ? "bg-surface-hover text-foreground" : undefined,
              )}
              aria-label={terminalOpen ? "Hide terminal" : "Show terminal"}
            >
              <TerminalSquare size={13} />
            </button>
          </ActionTooltip>
        )}

        <SessionMoveButton
          sessionId={sessionId}
          disabled={!canMoveSession}
          disabledReason={moveDisabledReason}
        />

        <div className="relative" ref={historyRef}>
          <ActionTooltip label="Session history">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={headerIconButtonClass}
              aria-label="Session history"
            >
              <History size={13} />
            </button>
          </ActionTooltip>
          {showHistory && (
            <div className="app-region-no-drag absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
              <SessionHistory sessionId={sessionId} />
            </div>
          )}
        </div>

        <GitHubActions
          sessionId={sessionId}
          prUrl={prUrl}
          agentStatus={agentStatus}
          connection={connection}
          worktreeDeleted={worktreeDeleted}
          canInteract={bridgeInteractionAllowed}
        />
      </div>
    </div>
  );
}
