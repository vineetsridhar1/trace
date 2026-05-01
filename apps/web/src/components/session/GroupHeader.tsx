import { useEffect, useRef, useState } from "react";
import {
  Circle,
  GitPullRequest,
  PanelRight,
  History,
  Maximize2,
  Minimize2,
  Play,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { sessionStatusColor, sessionStatusLabel } from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";
import { useRunScripts } from "../../hooks/useRunScripts";
import { useLinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";
import { LinkedCheckoutSubtitle } from "./LinkedCheckoutSubtitle";
import { LinkedCheckoutActions } from "./LinkedCheckoutActions";
import { SessionMoveButton } from "./SessionMoveButton";
import { LinkedCheckoutTargetSelect } from "./LinkedCheckoutTargetSelect";

interface GroupHeaderProps {
  groupName: string | undefined;
  sessionGroupId: string;
  repoId?: string | null;
  groupBranch?: string | null;
  linkedCheckoutRuntimeLabel?: string | null;
  linkedCheckoutRuntimeInstanceId?: string | null;
  canManageLinkedCheckout: boolean;
  canInteract: boolean;
  selectedSessionStatus: string;
  selectedSessionId: string | null;
  canMoveSession: boolean;
  moveDisabledReason?: string;
  groupPrUrl: string | null | undefined;
  panelMode?: boolean;
  isFullscreen: boolean;
  showSidebar: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
}

export function GroupHeader({
  groupName,
  sessionGroupId,
  repoId,
  groupBranch,
  linkedCheckoutRuntimeLabel,
  linkedCheckoutRuntimeInstanceId,
  canManageLinkedCheckout,
  canInteract,
  selectedSessionStatus,
  selectedSessionId,
  canMoveSession,
  moveDisabledReason,
  groupPrUrl,
  panelMode,
  isFullscreen,
  showSidebar,
  onClose,
  onToggleFullscreen,
  onToggleSidebar,
}: GroupHeaderProps) {
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const { hasRunScripts, canRun, handleRun } = useRunScripts(sessionGroupId, selectedSessionId);
  const linkedCheckout = useLinkedCheckoutHeaderState({
    repoId,
    groupBranch,
    runtimeLabel: linkedCheckoutRuntimeLabel,
    runtimeInstanceId: linkedCheckoutRuntimeInstanceId,
    sessionGroupId,
    enabled: canManageLinkedCheckout,
  });

  useEffect(() => {
    if (!showHistory) return;

    function handleClick(event: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowHistory(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showHistory]);

  const label = sessionStatusLabel[selectedSessionStatus] ?? selectedSessionStatus;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
      <button
        onClick={onClose}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        title="Close panel"
      >
        <X size={16} />
      </button>

      {selectedSessionId && (
        <span
          className={cn(
            "flex shrink-0 items-center gap-1.5 text-xs",
            sessionStatusColor[selectedSessionStatus],
          )}
        >
          <Circle size={6} className="fill-current" />
          {label}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">
          {groupName ?? "Session Group"}
        </h2>
        <LinkedCheckoutSubtitle state={linkedCheckout} />
      </div>

      <LinkedCheckoutTargetSelect state={linkedCheckout} />
      <LinkedCheckoutActions state={linkedCheckout} />

      {hasRunScripts && (
        <button
          onClick={handleRun}
          disabled={!canRun || !canInteract}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
          title="Run scripts"
        >
          <Play size={14} />
        </button>
      )}

      <SessionMoveButton
        sessionId={selectedSessionId}
        disabled={!canMoveSession}
        disabledReason={moveDisabledReason}
      />

      <button
        onClick={onToggleSidebar}
        className={cn(
          "hidden h-8 w-8 items-center justify-center rounded-md transition-colors sm:flex",
          showSidebar
            ? "bg-surface-elevated text-foreground"
            : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
        )}
        title="Toggle sidebar"
      >
        <PanelRight size={14} />
      </button>

      <div className="relative" ref={historyRef}>
        <button
          onClick={() => setShowHistory((value: boolean) => !value)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="Group history"
        >
          <History size={14} />
        </button>
        {showHistory && selectedSessionId && (
          <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
            <SessionHistory sessionId={selectedSessionId} />
          </div>
        )}
      </div>

      {groupPrUrl && (
        <a
          href={groupPrUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          title="View Pull Request"
        >
          <GitPullRequest size={14} />
        </a>
      )}

      {panelMode && (
        <button
          onClick={onToggleFullscreen}
          className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground sm:flex"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
    </div>
  );
}
