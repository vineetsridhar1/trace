import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  History,
  Circle,
  Loader2,
  WifiOff,
  Monitor,
  Cloud,
  TerminalSquare,
  GitPullRequest,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useEntityField, useEntityStore } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { useShallow } from "zustand/react/shallow";
import { useDetailPanelStore } from "../../stores/detail-panel";
import {
  statusColor,
  statusLabel,
  isDisconnected,
  isReviewAndActive,
  isGroupReviewAndActive,
  getDisplayStatus,
  getSessionGroupDisplayStatus,
} from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";

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
  const status = useEntityField("sessions", sessionId, "status");
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const groupPrUrl = useEntityField("sessionGroups", sessionGroupId ?? "", "prUrl") as
    | string
    | null
    | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const groupStatuses = useEntityStore(
    useShallow((state) => {
      if (!sessionGroupId) {
        const s = state.sessions[sessionId]?.status;
        return s ? [s] : [];
      }
      return Object.values(state.sessions)
        .filter((session) => session.sessionGroupId === sessionGroupId)
        .map((session) => session.status);
    }),
  );
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const isFullscreen = useDetailPanelStore((s) => s.isFullscreen);
  const toggleFullscreen = useDetailPanelStore((s) => s.toggleFullscreen);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const prUrl = groupPrUrl ?? null;

  const disconnected = isDisconnected(connection);

  const runtimeLabel = connection?.runtimeLabel as string | undefined;
  const isCloud = hosting === "cloud";
  const runtimeDisplayLabel = isCloud ? "Cloud" : (runtimeLabel ?? null);
  const displayStatus = sessionGroupId
    ? getSessionGroupDisplayStatus(groupStatuses, prUrl)
    : getDisplayStatus(status, prUrl);
  const reviewAndActive = sessionGroupId
    ? isGroupReviewAndActive(groupStatuses, prUrl)
    : isReviewAndActive(status, prUrl);

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
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
      {panelMode ? (
        <button
          onClick={() => setActiveSessionId(null)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Close panel"
        >
          <X size={16} />
        </button>
      ) : (
        <button
          onClick={() => setActiveSessionId(null)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
          title="Back to sessions"
        >
          <ArrowLeft size={16} />
        </button>
      )}

      {disconnected ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-destructive">
          <WifiOff size={12} />
          Connection Lost
        </span>
      ) : (
        <span
          className={`flex shrink-0 items-center gap-1.5 text-xs ${statusColor[displayStatus]}`}
        >
          {reviewAndActive ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            <Circle size={6} className="fill-current" />
          )}
          {statusLabel[displayStatus]}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground truncate">{name ?? "Session"}</h2>
      </div>

      {runtimeDisplayLabel && (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-xs text-muted-foreground">
          {isCloud ? <Cloud size={12} /> : <Monitor size={12} />}
          {runtimeDisplayLabel}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {panelMode && (
          <button
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}

        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              terminalOpen
                ? "bg-surface-elevated text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
            }`}
            title="Toggle terminal"
          >
            <TerminalSquare size={14} />
          </button>
        )}

        <div className="relative" ref={historyRef}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title="Session history"
          >
            <History size={14} />
          </button>
          {showHistory && (
            <div className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
              <SessionHistory sessionId={sessionId} />
            </div>
          )}
        </div>

        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            title="View Pull Request"
          >
            <GitPullRequest size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
