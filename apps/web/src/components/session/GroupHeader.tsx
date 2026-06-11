import { useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Circle,
  PanelRight,
  History,
  Maximize2,
  Minimize2,
  Play,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { sessionStatusColor, sessionStatusLabel } from "./sessionStatus";
import { SessionHistory } from "./SessionHistory";
import { useRunScripts } from "../../hooks/useRunScripts";
import { useLinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";
import { LinkedCheckoutSubtitle } from "./LinkedCheckoutSubtitle";
import { LinkedCheckoutActions } from "./LinkedCheckoutActions";
import { SessionMoveButton } from "./SessionMoveButton";
import { GitHubActions } from "./GitHubActions";
import { GroupUsageBadge } from "./GroupUsageBadge";
import { ActionTooltip } from "../ui/ActionTooltip";

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
  selectedAgentStatus?: string;
  selectedConnection?: Record<string, unknown> | null;
  selectedWorktreeDeleted?: boolean;
  canMoveSession: boolean;
  moveDisabledReason?: string;
  groupPrUrl: string | null | undefined;
  panelMode?: boolean;
  isFullscreen: boolean;
  showSidebar: boolean;
  showApplicationsSidebar: boolean;
  canShowApplications: boolean;
  onToggleFullscreen: () => void;
  onToggleSidebar: () => void;
  onToggleApplicationsSidebar: () => void;
}

const headerIconButtonClass =
  "app-region-no-drag flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background/40 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:cursor-default disabled:opacity-40";

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
  selectedAgentStatus,
  selectedConnection,
  selectedWorktreeDeleted,
  canMoveSession,
  moveDisabledReason,
  groupPrUrl,
  panelMode,
  isFullscreen,
  showSidebar,
  showApplicationsSidebar,
  canShowApplications,
  onToggleFullscreen,
  onToggleSidebar,
  onToggleApplicationsSidebar,
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
    <div className="app-region-drag flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface-mid py-0 pl-[var(--trace-header-title-offset)] pr-4 transition-[padding-left] duration-200 ease-in-out">
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

      <GroupUsageBadge sessionGroupId={sessionGroupId} />

      <GitHubActions
        sessionId={selectedSessionId}
        prUrl={groupPrUrl}
        agentStatus={selectedAgentStatus}
        connection={selectedConnection}
        worktreeDeleted={selectedWorktreeDeleted}
        canInteract={canInteract}
      />

      <LinkedCheckoutActions state={linkedCheckout} />

      {hasRunScripts && (
        <ActionTooltip label="Run scripts">
          <button
            onClick={handleRun}
            disabled={!canRun || !canInteract}
            className={headerIconButtonClass}
            aria-label="Run scripts"
          >
            <Play size={13} />
          </button>
        </ActionTooltip>
      )}

      <SessionMoveButton
        sessionId={selectedSessionId}
        disabled={!canMoveSession}
        disabledReason={moveDisabledReason}
      />

      <div className="relative" ref={historyRef}>
        <ActionTooltip label="Group history">
          <button
            onClick={() => setShowHistory((value: boolean) => !value)}
            className={headerIconButtonClass}
            aria-label="Group history"
          >
            <History size={13} />
          </button>
        </ActionTooltip>
        {showHistory && selectedSessionId && (
          <div className="app-region-no-drag absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg">
            <SessionHistory sessionId={selectedSessionId} />
          </div>
        )}
      </div>

      {panelMode && (
        <ActionTooltip label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          <button
            onClick={onToggleFullscreen}
            className={cn(headerIconButtonClass, "hidden sm:flex")}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </ActionTooltip>
      )}

      {canShowApplications && (
        <ActionTooltip label={showApplicationsSidebar ? "Hide applications" : "Applications"}>
          <button
            onClick={onToggleApplicationsSidebar}
            className={cn(
              headerIconButtonClass,
              "hidden sm:flex",
              showApplicationsSidebar ? "bg-surface-hover text-foreground" : undefined,
            )}
            aria-label={showApplicationsSidebar ? "Hide applications" : "Applications"}
          >
            <AppWindow size={13} />
          </button>
        </ActionTooltip>
      )}

      <ActionTooltip label={showSidebar ? "Hide sidebar" : "Show sidebar"}>
        <button
          onClick={onToggleSidebar}
          className={cn(
            headerIconButtonClass,
            "hidden sm:flex",
            showSidebar ? "bg-surface-hover text-foreground" : undefined,
          )}
          aria-label={showSidebar ? "Hide sidebar" : "Show sidebar"}
        >
          <PanelRight size={13} />
        </button>
      </ActionTooltip>
    </div>
  );
}
