import { useState } from "react";
import {
  Boxes,
  Cloud,
  FolderTree,
  Monitor,
  Maximize2,
  Minimize2,
  Play,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { sessionStatusColor, sessionStatusLabel } from "./sessionStatus";
import { AgentStatusIcon } from "./AgentStatusIcon";
import { SessionGroupArtifactsDialog } from "../artifact/SessionGroupArtifactsDialog";
import { useRunScripts } from "../../hooks/useRunScripts";
import { useLinkedCheckoutHeaderState } from "./useLinkedCheckoutHeaderState";
import { LinkedCheckoutSubtitle } from "./LinkedCheckoutSubtitle";
import { LinkedCheckoutActions } from "./LinkedCheckoutActions";
import { SessionMoveButton } from "./SessionMoveButton";
import { GitHubActions } from "./GitHubActions";
import { GroupUsageBadge } from "./GroupUsageBadge";
import { ActionTooltip } from "../ui/ActionTooltip";
import { ClosedSessionTabsMenu } from "./ClosedSessionTabsMenu";
import { SessionApplicationsPopover } from "./applications/SessionApplicationsPopover";
import type { SessionEntity } from "@trace/client-core";

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
  displayAgentStatus?: string;
  selectedHosting?: string;
  selectedConnection?: Record<string, unknown> | null;
  selectedWorktreeDeleted?: boolean;
  canShowApplications: boolean;
  applicationPanelOpen: boolean;
  onApplicationPanelOpenChange: (open: boolean) => void;
  onOpenTraffic: (endpointId: string) => void;
  closedSessions: SessionEntity[];
  onRestoreClosedSession: (sessionId: string) => void;
  canMoveSession: boolean;
  moveDisabledReason?: string;
  groupPrUrl: string | null | undefined;
  panelMode?: boolean;
  isFullscreen: boolean;
  compactCanvasMode?: boolean;
  filesOpen: boolean;
  onToggleFiles: () => void;
  onToggleFullscreen: () => void;
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
  displayAgentStatus,
  selectedHosting,
  selectedConnection,
  selectedWorktreeDeleted,
  canShowApplications,
  applicationPanelOpen,
  onApplicationPanelOpenChange,
  onOpenTraffic,
  closedSessions,
  onRestoreClosedSession,
  canMoveSession,
  moveDisabledReason,
  groupPrUrl,
  panelMode,
  isFullscreen,
  compactCanvasMode = false,
  filesOpen,
  onToggleFiles,
  onToggleFullscreen,
}: GroupHeaderProps) {
  const [showArtifacts, setShowArtifacts] = useState(false);
  const { hasRunScripts, canRun, handleRun } = useRunScripts(sessionGroupId, selectedSessionId);
  const linkedCheckout = useLinkedCheckoutHeaderState({
    repoId,
    groupBranch,
    runtimeLabel: linkedCheckoutRuntimeLabel,
    runtimeInstanceId: linkedCheckoutRuntimeInstanceId,
    sessionGroupId,
    enabled: canManageLinkedCheckout,
  });

  const label = sessionStatusLabel[selectedSessionStatus] ?? selectedSessionStatus;
  const isCloud = selectedHosting === "cloud";
  const runtimeLabel =
    typeof selectedConnection?.runtimeLabel === "string" ? selectedConnection.runtimeLabel : null;

  return (
    <div className="app-region-drag flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface-mid py-0 pl-[var(--trace-header-title-offset)] pr-4 transition-[padding-left] duration-200 ease-in-out">
      {selectedSessionId && (
        <>
          <ActionTooltip
            label={isCloud ? "Cloud" : (runtimeLabel ?? "Local")}
            className="app-region-no-drag"
          >
            <span className="flex shrink-0 items-center justify-center">
              {isCloud ? (
                <Cloud size={14} className="text-sky-400" />
              ) : (
                <Monitor size={14} className="text-green-400" />
              )}
            </span>
          </ActionTooltip>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-xs",
              sessionStatusColor[selectedSessionStatus],
            )}
          >
            <AgentStatusIcon agentStatus={displayAgentStatus ?? "done"} size={8} />
            {label}
          </span>
        </>
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

      <ClosedSessionTabsMenu sessions={closedSessions} onRestoreSession={onRestoreClosedSession} />

      {canShowApplications ? (
        <SessionApplicationsPopover
          sessionGroupId={sessionGroupId}
          open={applicationPanelOpen}
          onOpenChange={onApplicationPanelOpenChange}
          onOpenTraffic={onOpenTraffic}
        />
      ) : null}

      <ActionTooltip label={filesOpen ? "Close files and changes" : "Files and changes"}>
        <button
          onClick={onToggleFiles}
          className={cn(headerIconButtonClass, filesOpen && "bg-white/10 text-foreground")}
          aria-label={filesOpen ? "Close files and changes" : "Files and changes"}
          aria-pressed={filesOpen}
        >
          <FolderTree size={13} />
        </button>
      </ActionTooltip>

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

      {!compactCanvasMode ? (
        <SessionMoveButton
          sessionId={selectedSessionId}
          disabled={!canMoveSession}
          disabledReason={moveDisabledReason}
        />
      ) : null}

      {!compactCanvasMode ? (
        <>
          <ActionTooltip label="Artifacts">
            <button
              onClick={() => setShowArtifacts(true)}
              className={headerIconButtonClass}
              aria-label="Artifacts"
            >
              <Boxes size={13} />
            </button>
          </ActionTooltip>
          <SessionGroupArtifactsDialog
            sessionGroupId={sessionGroupId}
            open={showArtifacts}
            onOpenChange={setShowArtifacts}
          />
        </>
      ) : null}

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

    </div>
  );
}
